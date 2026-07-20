import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type StorageBackupExecutionRequest,
  type StorageBackupProviderRegistryPort,
  type StorageBackupObjectTransferAuthorization,
  type StorageBackupObjectTransferBrokerPort,
  type StorageBackupRestoreRequest,
  type StorageBackupSourceAdapterPort,
  type StorageBackupSourceResult,
  type StorageBackupTargetProviderPort,
  type StorageBackupTargetRestoreRequest,
  type StorageBackupTargetRestoreResult,
  type StorageBackupTargetStoreRequest,
  type StorageBackupTargetStoreResult,
} from "@appaloft/application";
import { type AshScript, ash } from "@appaloft/ash";
import { type DeploymentTargetState, domainError, err, ok, type Result } from "@appaloft/core";
import { runBufferedProcess, shellCommand } from "./buffered-process";
import { dockerVolumeNameForStorageVolumeId } from "./storage-runtime-mounts";

interface PreparedSshArgs {
  args: string[];
  cleanup(): void;
}

interface StorageBackupCommandResult {
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
}

export type StorageBackupRuntimeCommandDialect = "posix-shell-docker" | (string & {});

export interface DockerVolumeTarBackupScriptInput {
  storageVolumeId: string;
  dockerVolumeName: string;
  backupId: string;
  attemptId: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
  workingRoot: string;
}

export interface DockerVolumeSqliteOnlineBackupScriptInput {
  storageVolumeId: string;
  dockerVolumeName: string;
  backupId: string;
  attemptId: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
  sqliteHelperImage: string;
  workingRoot: string;
}

export interface LocalFilesystemStoreBackupScriptInput {
  sourceRef: string;
  storageVolumeId: string;
  backupId: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
  targetRef: string;
  retentionMaxCount: number;
}

export interface LocalFilesystemRestoreBackupScriptInput {
  artifactHandle: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
  targetStorageVolumeId: string;
  targetDockerVolumeName: string;
}

export interface S3CompatibleStoreBackupScriptInput {
  sourceRef: string;
  artifactHandle: string;
  uploadUrl: string;
  headers?: Readonly<Record<string, string>>;
  backupId: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
}

export interface S3CompatibleRestoreBackupScriptInput {
  artifactHandle: string;
  downloadUrl: string;
  headers?: Readonly<Record<string, string>>;
  expectedChecksum?: string;
  backupId: string;
  restoreAttemptId: string;
  workingRoot: string;
  targetStorageVolumeId: string;
  targetDockerVolumeName: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
}

export interface StorageBackupRuntimeCommandRenderer {
  readonly key: StorageBackupRuntimeCommandDialect;
  renderDockerVolumeTarBackup(
    input: Omit<DockerVolumeTarBackupScriptInput, "commandDialect">,
  ): AshScript;
  renderDockerVolumeSqliteOnlineBackup(
    input: Omit<DockerVolumeSqliteOnlineBackupScriptInput, "commandDialect">,
  ): AshScript;
  renderLocalFilesystemStoreBackup(
    input: Omit<LocalFilesystemStoreBackupScriptInput, "commandDialect">,
  ): AshScript;
  renderLocalFilesystemRestoreBackup(
    input: Omit<LocalFilesystemRestoreBackupScriptInput, "commandDialect">,
  ): AshScript;
  renderS3CompatibleStoreBackup?(
    input: Omit<S3CompatibleStoreBackupScriptInput, "commandDialect">,
  ): AshScript;
  renderS3CompatibleRestoreBackup?(
    input: Omit<S3CompatibleRestoreBackupScriptInput, "commandDialect">,
  ): AshScript;
}

const backupManifestPrefix = "appaloft-storage-volume-backup://";
const defaultTimeoutMs = 120_000;
const defaultStorageBackupWorkingRoot = "/var/lib/appaloft/backups/.work";
const defaultSqliteHelperImage = "keinos/sqlite3:latest";

export interface StorageBackupRuntimeProviderOptions {
  sqliteHelperImage?: string;
  commandDialect?: StorageBackupRuntimeCommandDialect;
  commandRenderers?: readonly StorageBackupRuntimeCommandRenderer[];
  workingRoot?: string;
  objectTransferBroker?: StorageBackupObjectTransferBrokerPort;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function prepareSshArgs(server: DeploymentTargetState, remoteCommand: string): PreparedSshArgs {
  const credential = server.credential;
  let tempDir: string | undefined;
  let identityArgs: string[] = [];

  if (credential?.kind.value === "ssh-private-key" && credential.privateKey) {
    tempDir = mkdtempSync(join(tmpdir(), "appaloft-storage-backup-ssh-"));
    const identityFile = join(tempDir, "id_deployment_target");
    writeFileSync(
      identityFile,
      credential.privateKey.value.endsWith("\n")
        ? credential.privateKey.value
        : `${credential.privateKey.value}\n`,
      { mode: 0o600 },
    );
    chmodSync(identityFile, 0o600);
    identityArgs = ["-i", identityFile, "-o", "IdentitiesOnly=yes"];
  }

  return {
    args: [
      "-p",
      String(server.port.value),
      ...identityArgs,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "StrictHostKeyChecking=accept-new",
      hostWithUsername(server.host.value, credential?.username?.value),
      remoteCommand,
    ],
    cleanup(): void {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

function supportsRuntimeTarget(server: DeploymentTargetState | undefined): boolean {
  const providerKey = server?.providerKey.value;
  return providerKey === "local-shell" || providerKey === "generic-ssh";
}

function resolveRuntimeCommandRenderer(
  server: DeploymentTargetState | undefined,
  options: StorageBackupRuntimeProviderOptions,
): Result<StorageBackupRuntimeCommandRenderer> {
  if (!supportsRuntimeTarget(server)) {
    return err(
      domainError.runtimeTargetUnsupported("Storage volume backup target is unsupported", {
        phase: "storage-volume-backup-runtime-dialect",
        providerKey: server?.providerKey.value ?? "unknown",
        targetKind: server?.targetKind.value ?? "unknown",
        missingCapability: "storage.volume-backup",
      }),
    );
  }

  const commandDialect = options.commandDialect ?? "posix-shell-docker";
  const commandRenderer = [
    ...(options.commandRenderers ?? []),
    new PosixShellDockerStorageBackupRuntimeCommandRenderer(),
  ].find((renderer) => renderer.key === commandDialect);

  if (!commandRenderer) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Storage volume backup runtime command dialect is unsupported",
        {
          phase: "storage-volume-backup-runtime-dialect",
          providerKey: server?.providerKey.value ?? "unknown",
          targetKind: server?.targetKind.value ?? "unknown",
          commandDialect,
          missingCapability: `storage.volume-backup.${commandDialect}`,
        },
      ),
    );
  }

  return ok(commandRenderer);
}

async function runStorageBackupScript(
  server: DeploymentTargetState | undefined,
  script: AshScript,
  redactions: readonly string[] = [],
): Promise<StorageBackupCommandResult> {
  if (!server || server.providerKey.value === "local-shell") {
    const result = await runBufferedProcess({
      command: shellCommand(ash.render(script)),
      timeoutMs: defaultTimeoutMs,
      timeoutMessage: "Storage volume backup command timed out",
      redactions,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      failed: result.failed,
      timedOut: result.timedOut,
    };
  }

  const prepared = prepareSshArgs(server, ash.render(script));
  try {
    const result = await runBufferedProcess({
      command: ["ssh", ...prepared.args],
      timeoutMs: defaultTimeoutMs,
      timeoutMessage: "Storage volume backup SSH command timed out",
      redactions: [server.credential?.privateKey?.value ?? "", ...redactions],
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      failed: result.failed,
      timedOut: result.timedOut,
    };
  } finally {
    prepared.cleanup();
  }
}

function backupCommandError(
  message: string,
  input: {
    phase: string;
    backupId: string;
    stdout?: string;
    stderr?: string;
    timedOut?: boolean;
  },
) {
  const marker = input.stdout
    ?.split(/\r?\n/)
    .find((line) => line.startsWith("STORAGE_BACKUP_ERROR\t"));
  const diagnostic = (input.stderr?.trim() || marker || (input.timedOut ? "command timed out" : ""))
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const failureMessage = diagnostic ? `${message}: ${diagnostic}` : message;

  return domainError.infra(failureMessage, {
    phase: input.phase,
    backupId: input.backupId,
    ...(marker ? { marker: marker.slice(0, 240) } : {}),
    ...(input.stderr ? { stderr: input.stderr.slice(0, 240) } : {}),
    ...(input.timedOut !== undefined ? { timedOut: input.timedOut } : {}),
  });
}

export function renderDockerVolumeTarBackupScript(input: DockerVolumeTarBackupScriptInput): AshScript {
  const commandDialect = input.commandDialect ?? "posix-shell-docker";
  return ash`
    set -eu
    ${ash.env("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT", commandDialect)}
    ${ash.env("APPALOFT_STORAGE_VOLUME_ID", input.storageVolumeId)}
    ${ash.env("APPALOFT_DOCKER_VOLUME_NAME", input.dockerVolumeName)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ID", input.backupId)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ATTEMPT_ID", input.attemptId)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_WORKING_ROOT", input.workingRoot)}
    ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_SOURCE_V1\\n'
    if ! command -v docker >/dev/null 2>&1; then
      printf 'STORAGE_BACKUP_ERROR\\tdocker-unavailable\\tdocker command is unavailable\\n'
      exit 20
    fi
    volume_storage_id=$(docker volume inspect -f '{{ index .Labels "appaloft.storage-volume-id" }}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null || true)
    volume_managed=$(docker volume inspect -f '{{ index .Labels "appaloft.managed" }}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null || true)
    if [ "$volume_storage_id" != "$APPALOFT_STORAGE_VOLUME_ID" ] || [ "$volume_managed" != "true" ]; then
      printf 'STORAGE_BACKUP_ERROR\\townership-unproven\\tstorage volume ownership labels do not match\\n'
      exit 21
    fi
    mkdir -p "$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/sources"
    source_ref="$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/sources/$APPALOFT_STORAGE_BACKUP_ID.$APPALOFT_STORAGE_BACKUP_ATTEMPT_ID.tar.gz"
    rm -f "$source_ref"
    docker run --rm -v "$APPALOFT_DOCKER_VOLUME_NAME:/source:ro" -v "$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/sources:/backup" alpine:3.20 sh -c "cd /source && tar -czf /backup/$APPALOFT_STORAGE_BACKUP_ID.$APPALOFT_STORAGE_BACKUP_ATTEMPT_ID.tar.gz ."
    size_bytes=$(wc -c < "$source_ref" | tr -d ' ')
    checksum=$(sha256sum "$source_ref" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$source_ref" | awk '{print $1}')
    printf 'STORAGE_BACKUP_SOURCE\\t%s\\t%s\\t%s\\n' "$source_ref" "$size_bytes" "$checksum"`)}
  `;
}

export function renderDockerVolumeSqliteOnlineBackupScript(
  input: DockerVolumeSqliteOnlineBackupScriptInput,
): AshScript {
  const commandDialect = input.commandDialect ?? "posix-shell-docker";
  return ash`
    set -eu
    ${ash.env("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT", commandDialect)}
    ${ash.env("APPALOFT_STORAGE_VOLUME_ID", input.storageVolumeId)}
    ${ash.env("APPALOFT_DOCKER_VOLUME_NAME", input.dockerVolumeName)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ID", input.backupId)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ATTEMPT_ID", input.attemptId)}
    ${ash.env("APPALOFT_SQLITE_HELPER_IMAGE", input.sqliteHelperImage)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_WORKING_ROOT", input.workingRoot)}
    ${ash.raw(`helper_container="appaloft-storage-backup-$APPALOFT_STORAGE_BACKUP_ID-$APPALOFT_STORAGE_BACKUP_ATTEMPT_ID"
    cleanup_helper() { docker rm -f "$helper_container" >/dev/null 2>&1 || true; }
    trap cleanup_helper EXIT INT TERM
    printf 'APPALOFT_STORAGE_BACKUP_SOURCE_V1\\n'
    if ! command -v docker >/dev/null 2>&1; then
      printf 'STORAGE_BACKUP_ERROR\\tdocker-unavailable\\tdocker command is unavailable\\n'
      exit 20
    fi
    volume_storage_id=$(docker volume inspect -f '{{ index .Labels "appaloft.storage-volume-id" }}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null || true)
    volume_managed=$(docker volume inspect -f '{{ index .Labels "appaloft.managed" }}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null || true)
    if [ "$volume_storage_id" != "$APPALOFT_STORAGE_VOLUME_ID" ] || [ "$volume_managed" != "true" ]; then
      printf 'STORAGE_BACKUP_ERROR\\townership-unproven\\tstorage volume ownership labels do not match\\n'
      exit 21
    fi
    work_dir="$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/sqlite/$APPALOFT_STORAGE_BACKUP_ID.$APPALOFT_STORAGE_BACKUP_ATTEMPT_ID"
    export_dir="$work_dir/export"
    rm -rf "$work_dir"
    mkdir -p "$export_dir" "$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/sources"
    cat > "$work_dir/sqlite-online-backup.sh" <<'APPALOFT_SQLITE_BACKUP_SCRIPT'
    set -eu
    if ! command -v sqlite3 >/dev/null 2>&1; then
      printf 'sqlite3 command is unavailable\\n' >&2
      exit 22
    fi
    sqlite_relative_path=''
    for candidate in data.db pocketbase.db app.db database.db database.sqlite database.sqlite3; do
      if [ -f "/source/$candidate" ]; then
        sqlite_relative_path="$candidate"
        break
      fi
    done
    if [ -z "$sqlite_relative_path" ]; then
      sqlite_relative_path=$(cd /source && find . -maxdepth 4 -type f \\( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \\) | sed 's#^\\./##' | sort | head -n 1)
    fi
    case "$sqlite_relative_path" in
      ''|/*|../*|*/../*|*/..|*//*)
        printf 'SQLite database path is missing or unsafe\\n' >&2
        exit 24
        ;;
    esac
    tar -czf /backup/raw.tar.gz -C /source .
    tar -xzf /backup/raw.tar.gz -C /backup/export
    sqlite_export_path="/backup/export/$sqlite_relative_path"
    mkdir -p "$(dirname "$sqlite_export_path")"
    rm -f "$sqlite_export_path" "$sqlite_export_path-wal" "$sqlite_export_path-shm"
    sqlite3 "/source/$sqlite_relative_path" ".backup '$sqlite_export_path'"
    rm -f "$sqlite_export_path-wal" "$sqlite_export_path-shm"
    printf '%s\\n' "$sqlite_relative_path" > /backup/sqlite-path
    APPALOFT_SQLITE_BACKUP_SCRIPT
    docker run --name "$helper_container" --rm --user "$(id -u):$(id -g)" -v "$APPALOFT_DOCKER_VOLUME_NAME:/source" -v "$work_dir:/backup" "$APPALOFT_SQLITE_HELPER_IMAGE" sh /backup/sqlite-online-backup.sh
    source_ref="$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/sources/$APPALOFT_STORAGE_BACKUP_ID.$APPALOFT_STORAGE_BACKUP_ATTEMPT_ID.sqlite.tar.gz"
    rm -f "$source_ref"
    tar -czf "$source_ref" -C "$export_dir" .
    size_bytes=$(wc -c < "$source_ref" | tr -d ' ')
    checksum=$(sha256sum "$source_ref" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$source_ref" | awk '{print $1}')
    printf 'STORAGE_BACKUP_SOURCE\\t%s\\t%s\\t%s\\n' "$source_ref" "$size_bytes" "$checksum"`)}
  `;
}

export function renderLocalFilesystemStoreBackupScript(
  input: LocalFilesystemStoreBackupScriptInput,
): AshScript {
  const commandDialect = input.commandDialect ?? "posix-shell-docker";
  return ash`
    set -eu
    ${ash.env("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT", commandDialect)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_SOURCE_REF", input.sourceRef)}
    ${ash.env("APPALOFT_STORAGE_VOLUME_ID", input.storageVolumeId)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ID", input.backupId)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_TARGET_REF", input.targetRef)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_RETENTION_MAX_COUNT", input.retentionMaxCount)}
    ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_TARGET_V1\\n'
    artifact_dir="$APPALOFT_STORAGE_BACKUP_TARGET_REF/storage-volume/$APPALOFT_STORAGE_VOLUME_ID"
    mkdir -p "$artifact_dir"
    artifact_path="$artifact_dir/$APPALOFT_STORAGE_BACKUP_ID.tar.gz"
    cp "$APPALOFT_STORAGE_BACKUP_SOURCE_REF" "$artifact_path"
    size_bytes=$(wc -c < "$artifact_path" | tr -d ' ')
    checksum=$(sha256sum "$artifact_path" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$artifact_path" | awk '{print $1}')
    if [ "$APPALOFT_STORAGE_BACKUP_RETENTION_MAX_COUNT" -gt 0 ]; then
      ls -1t "$artifact_dir"/*.tar.gz 2>/dev/null | tail -n +$((APPALOFT_STORAGE_BACKUP_RETENTION_MAX_COUNT + 1)) | while IFS= read -r old_artifact; do
        if [ -n "$old_artifact" ]; then
          rm -f "$old_artifact"
        fi
      done
    fi
    printf 'STORAGE_BACKUP_ARTIFACT\\t%s\\t%s\\t%s\\n' "$artifact_path" "$size_bytes" "$checksum"`)}
  `;
}

export function renderLocalFilesystemRestoreBackupScript(
  input: LocalFilesystemRestoreBackupScriptInput,
): AshScript {
  const commandDialect = input.commandDialect ?? "posix-shell-docker";
  return ash`
    set -eu
    ${ash.env("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT", commandDialect)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ARTIFACT", input.artifactHandle)}
    ${ash.env("APPALOFT_TARGET_STORAGE_VOLUME_ID", input.targetStorageVolumeId)}
    ${ash.env("APPALOFT_TARGET_DOCKER_VOLUME_NAME", input.targetDockerVolumeName)}
    ${ash.raw(`printf 'APPALOFT_STORAGE_RESTORE_TARGET_V1\\n'
    if ! command -v docker >/dev/null 2>&1; then
      printf 'STORAGE_RESTORE_ERROR\\tdocker-unavailable\\tdocker command is unavailable\\n'
      exit 20
    fi
    test -f "$APPALOFT_STORAGE_BACKUP_ARTIFACT"
    docker volume create --label appaloft.managed=true --label appaloft.storage-volume-id="$APPALOFT_TARGET_STORAGE_VOLUME_ID" --label appaloft.storage-volume-kind=named-volume "$APPALOFT_TARGET_DOCKER_VOLUME_NAME" >/dev/null
    docker run --rm -v "$APPALOFT_TARGET_DOCKER_VOLUME_NAME:/target" -v "$APPALOFT_STORAGE_BACKUP_ARTIFACT:/backup.tar.gz:ro" alpine:3.20 sh -c "cd /target && tar -xzf /backup.tar.gz"
    printf 'STORAGE_RESTORE_COMPLETED\\t%s\\n' "$APPALOFT_TARGET_DOCKER_VOLUME_NAME"`)}
  `;
}

function transferHeaderArgs(headers: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(headers ?? {}).flatMap(([name, value]) => ["-H", `${name}: ${value}`]);
}

export function renderS3CompatibleStoreBackupScript(
  input: S3CompatibleStoreBackupScriptInput,
): AshScript {
  const commandDialect = input.commandDialect ?? "posix-shell-docker";
  const headerArgs = transferHeaderArgs(input.headers).map(ash.quote).join(" ");
  return ash`
    set -eu
    ${ash.env("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT", commandDialect)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_SOURCE_REF", input.sourceRef)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ARTIFACT_HANDLE", input.artifactHandle)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_UPLOAD_URL", input.uploadUrl)}
    ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_TARGET_V1\\n'
    if ! command -v curl >/dev/null 2>&1; then
      printf 'STORAGE_BACKUP_ERROR\\tcurl-unavailable\\tcurl command is unavailable\\n'
      exit 20
    fi
    test -f "$APPALOFT_STORAGE_BACKUP_SOURCE_REF"
    size_bytes=$(wc -c < "$APPALOFT_STORAGE_BACKUP_SOURCE_REF" | tr -d ' ')
    checksum=$(sha256sum "$APPALOFT_STORAGE_BACKUP_SOURCE_REF" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$APPALOFT_STORAGE_BACKUP_SOURCE_REF" | awk '{print $1}')
    set -- ${headerArgs}
    http_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --request PUT "$@" --upload-file "$APPALOFT_STORAGE_BACKUP_SOURCE_REF" "$APPALOFT_STORAGE_BACKUP_UPLOAD_URL")
    case "$http_status" in
      2??) ;;
      *) printf 'STORAGE_BACKUP_ERROR\\tupload-failed\\tobject upload returned HTTP %s\\n' "$http_status"; exit 21 ;;
    esac
    rm -f "$APPALOFT_STORAGE_BACKUP_SOURCE_REF"
    printf 'STORAGE_BACKUP_ARTIFACT\\t%s\\t%s\\t%s\\n' "$APPALOFT_STORAGE_BACKUP_ARTIFACT_HANDLE" "$size_bytes" "$checksum"`)}
  `;
}

export function renderS3CompatibleRestoreBackupScript(
  input: S3CompatibleRestoreBackupScriptInput,
): AshScript {
  const commandDialect = input.commandDialect ?? "posix-shell-docker";
  const headerArgs = transferHeaderArgs(input.headers).map(ash.quote).join(" ");
  return ash`
    set -eu
    ${ash.env("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT", commandDialect)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ARTIFACT_HANDLE", input.artifactHandle)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_DOWNLOAD_URL", input.downloadUrl)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_EXPECTED_CHECKSUM", input.expectedChecksum ?? "")}
    ${ash.env("APPALOFT_STORAGE_BACKUP_ID", input.backupId)}
    ${ash.env("APPALOFT_STORAGE_RESTORE_ATTEMPT_ID", input.restoreAttemptId)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_WORKING_ROOT", input.workingRoot)}
    ${ash.env("APPALOFT_TARGET_STORAGE_VOLUME_ID", input.targetStorageVolumeId)}
    ${ash.env("APPALOFT_TARGET_DOCKER_VOLUME_NAME", input.targetDockerVolumeName)}
    ${ash.raw(`printf 'APPALOFT_STORAGE_RESTORE_TARGET_V1\\n'
    if ! command -v curl >/dev/null 2>&1; then
      printf 'STORAGE_RESTORE_ERROR\\tcurl-unavailable\\tcurl command is unavailable\\n'
      exit 20
    fi
    if ! command -v docker >/dev/null 2>&1; then
      printf 'STORAGE_RESTORE_ERROR\\tdocker-unavailable\\tdocker command is unavailable\\n'
      exit 20
    fi
    restore_dir="$APPALOFT_STORAGE_BACKUP_WORKING_ROOT/restores"
    mkdir -p "$restore_dir"
    artifact_path="$restore_dir/$APPALOFT_STORAGE_BACKUP_ID.$APPALOFT_STORAGE_RESTORE_ATTEMPT_ID.tar.gz"
    trap 'rm -f "$artifact_path"' EXIT INT TERM
    set -- ${headerArgs}
    http_status=$(curl --silent --show-error --output "$artifact_path" --write-out '%{http_code}' --request GET "$@" "$APPALOFT_STORAGE_BACKUP_DOWNLOAD_URL")
    case "$http_status" in
      2??) ;;
      *) printf 'STORAGE_RESTORE_ERROR\\tdownload-failed\\tobject download returned HTTP %s\\n' "$http_status"; exit 21 ;;
    esac
    actual_checksum=$(sha256sum "$artifact_path" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$artifact_path" | awk '{print $1}')
    if [ -n "$APPALOFT_STORAGE_BACKUP_EXPECTED_CHECKSUM" ] && [ "$actual_checksum" != "$APPALOFT_STORAGE_BACKUP_EXPECTED_CHECKSUM" ]; then
      printf 'STORAGE_RESTORE_ERROR\\tchecksum-mismatch\\tdownloaded artifact checksum does not match\\n'
      exit 22
    fi
    docker volume create --label appaloft.managed=true --label appaloft.storage-volume-id="$APPALOFT_TARGET_STORAGE_VOLUME_ID" --label appaloft.storage-volume-kind=named-volume "$APPALOFT_TARGET_DOCKER_VOLUME_NAME" >/dev/null
    docker run --rm -v "$APPALOFT_TARGET_DOCKER_VOLUME_NAME:/target" -v "$artifact_path:/backup.tar.gz:ro" alpine:3.20 sh -c "cd /target && tar -xzf /backup.tar.gz"
    printf 'STORAGE_RESTORE_COMPLETED\\t%s\\n' "$APPALOFT_TARGET_DOCKER_VOLUME_NAME"`)}
  `;
}

function parseSourceOutput(input: {
  stdout: string;
  backupId: string;
  timedOut: boolean;
}): Result<StorageBackupSourceResult> {
  const lines = input.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.includes("APPALOFT_STORAGE_BACKUP_SOURCE_V1")) {
    return err(
      backupCommandError("Storage volume backup source output was not recognized", {
        phase: "storage-volume-backup-source",
        backupId: input.backupId,
        timedOut: input.timedOut,
      }),
    );
  }

  for (const line of lines) {
    const [kind, sourceRef, sizeBytes, checksum] = line.split("\t");
    if (kind === "STORAGE_BACKUP_SOURCE" && sourceRef) {
      return ok({
        sourceRef,
        manifest: {
          sizeBytes: Number(sizeBytes ?? 0),
          ...(checksum ? { checksum } : {}),
        },
      });
    }
  }

  return err(
    backupCommandError("Storage volume backup source artifact was not reported", {
      phase: "storage-volume-backup-source",
      backupId: input.backupId,
      timedOut: input.timedOut,
    }),
  );
}

function parseStoreOutput(input: {
  stdout: string;
  backupId: string;
  timedOut: boolean;
}): Result<StorageBackupTargetStoreResult> {
  const lines = input.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.includes("APPALOFT_STORAGE_BACKUP_TARGET_V1")) {
    return err(
      backupCommandError("Storage volume backup target output was not recognized", {
        phase: "storage-volume-backup-target",
        backupId: input.backupId,
        timedOut: input.timedOut,
      }),
    );
  }

  for (const line of lines) {
    const [kind, artifactHandle, sizeBytes, checksum] = line.split("\t");
    if (kind === "STORAGE_BACKUP_ARTIFACT" && artifactHandle) {
      return ok({
        artifactHandle,
        completedAt: new Date().toISOString(),
        retentionStatus: "retained",
        sizeBytes: Number(sizeBytes ?? 0),
        ...(checksum ? { checksum } : {}),
      });
    }
  }

  return err(
    backupCommandError("Storage volume backup artifact was not reported", {
      phase: "storage-volume-backup-target",
      backupId: input.backupId,
      timedOut: input.timedOut,
    }),
  );
}

function parseRestoreOutput(input: {
  stdout: string;
  backupId: string;
  timedOut: boolean;
}): Result<StorageBackupTargetRestoreResult> {
  const lines = input.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.includes("APPALOFT_STORAGE_RESTORE_TARGET_V1")) {
    return err(
      backupCommandError("Storage volume restore output was not recognized", {
        phase: "storage-volume-restore-target",
        backupId: input.backupId,
        timedOut: input.timedOut,
      }),
    );
  }

  if (lines.some((line) => line.startsWith("STORAGE_RESTORE_COMPLETED\t"))) {
    return ok({ restoredAt: new Date().toISOString() });
  }

  return err(
    backupCommandError("Storage volume restore completion was not reported", {
      phase: "storage-volume-restore-target",
      backupId: input.backupId,
      timedOut: input.timedOut,
    }),
  );
}

function sourceRefFromArtifactHandle(artifactHandle: string): string | undefined {
  return artifactHandle.startsWith(backupManifestPrefix)
    ? artifactHandle.slice(backupManifestPrefix.length)
    : artifactHandle;
}

function validateTransferAuthorization(
  input: StorageBackupObjectTransferAuthorization,
  phase: string,
  backupId: string,
): Result<StorageBackupObjectTransferAuthorization> {
  let url: URL;
  if (/[\u0000-\u0020\u007f]/.test(input.url)) {
    return err(
      domainError.validation("Storage backup transfer authorization URL is unsafe", {
        phase,
        backupId,
      }),
    );
  }
  try {
    url = new URL(input.url);
  } catch {
    return err(
      domainError.validation("Storage backup transfer authorization URL is invalid", {
        phase,
        backupId,
      }),
    );
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    return err(
      domainError.validation("Storage backup transfer authorization URL is unsafe", {
        phase,
        backupId,
      }),
    );
  }
  const expiresAt = Date.parse(input.expiresAt);
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 60 * 60 * 1000) {
    return err(
      domainError.validation("Storage backup transfer authorization expiry is invalid", {
        phase,
        backupId,
      }),
    );
  }
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    const normalizedName = name.toLowerCase();
    if (
      !/^[a-z0-9!#$%&'*+.^_`|~-]+$/i.test(name) ||
      /[\r\n]/.test(value) ||
      normalizedName === "authorization" ||
      normalizedName === "cookie" ||
      normalizedName === "proxy-authorization" ||
      normalizedName === "x-amz-security-token"
    ) {
      return err(
        domainError.validation("Storage backup transfer authorization header is unsafe", {
          phase,
          backupId,
          headerName: name,
        }),
      );
    }
  }
  return ok(input);
}

function safeS3CompatibleArtifactHandle(artifactHandle: string): boolean {
  if (
    !artifactHandle.startsWith("s3-compatible://") ||
    /[?#\u0000-\u0020\u007f]/.test(artifactHandle)
  ) {
    return false;
  }
  try {
    const parsed = new URL(artifactHandle);
    return parsed.protocol === "s3-compatible:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function safeS3CompatibleTargetRef(targetRef: string): boolean {
  if (
    (!targetRef.startsWith("s3://") && !targetRef.startsWith("s3-compatible://")) ||
    /[?#\u0000-\u0020\u007f]/.test(targetRef)
  ) {
    return false;
  }
  try {
    const parsed = new URL(targetRef);
    return (
      (parsed.protocol === "s3:" || parsed.protocol === "s3-compatible:") &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function transferAuthorizationRedactions(
  authorization: StorageBackupObjectTransferAuthorization,
): string[] {
  const sensitiveHeaderName =
    /(^|[-_])(authorization|token|secret|credential|api[-_]?key|private[-_]?key|customer[-_]?key|cookie)($|[-_])/;
  const sensitiveHeaderValues = Object.entries(authorization.headers ?? {})
    .filter(([name]) => sensitiveHeaderName.test(name.toLowerCase()))
    .map(([, value]) => value);
  return [authorization.url, ...sensitiveHeaderValues].filter((value) => value.length > 0);
}

export class PosixShellDockerStorageBackupRuntimeCommandRenderer
  implements StorageBackupRuntimeCommandRenderer
{
  readonly key: StorageBackupRuntimeCommandDialect = "posix-shell-docker";

  renderDockerVolumeTarBackup(
    input: Omit<DockerVolumeTarBackupScriptInput, "commandDialect">,
  ): AshScript {
    return renderDockerVolumeTarBackupScript({ ...input, commandDialect: this.key });
  }

  renderDockerVolumeSqliteOnlineBackup(
    input: Omit<DockerVolumeSqliteOnlineBackupScriptInput, "commandDialect">,
  ): AshScript {
    return renderDockerVolumeSqliteOnlineBackupScript({ ...input, commandDialect: this.key });
  }

  renderLocalFilesystemStoreBackup(
    input: Omit<LocalFilesystemStoreBackupScriptInput, "commandDialect">,
  ): AshScript {
    return renderLocalFilesystemStoreBackupScript({ ...input, commandDialect: this.key });
  }

  renderLocalFilesystemRestoreBackup(
    input: Omit<LocalFilesystemRestoreBackupScriptInput, "commandDialect">,
  ): AshScript {
    return renderLocalFilesystemRestoreBackupScript({ ...input, commandDialect: this.key });
  }

  renderS3CompatibleStoreBackup(
    input: Omit<S3CompatibleStoreBackupScriptInput, "commandDialect">,
  ): AshScript {
    return renderS3CompatibleStoreBackupScript({ ...input, commandDialect: this.key });
  }

  renderS3CompatibleRestoreBackup(
    input: Omit<S3CompatibleRestoreBackupScriptInput, "commandDialect">,
  ): AshScript {
    return renderS3CompatibleRestoreBackupScript({ ...input, commandDialect: this.key });
  }
}

export class DockerTarStorageBackupSourceAdapter implements StorageBackupSourceAdapterPort {
  readonly key = "tar-volume";

  constructor(private readonly options: StorageBackupRuntimeProviderOptions = {}) {}

  supports(input: Parameters<StorageBackupSourceAdapterPort["supports"]>[0]): boolean {
    if (input.source.dataFormat === "sqlite" && input.requestedConsistency === "application-consistent") {
      return false;
    }

    return true;
  }

  async createBackup(
    input: StorageBackupExecutionRequest,
  ): Promise<Result<StorageBackupSourceResult>> {
    const commandRenderer = resolveRuntimeCommandRenderer(input.runtimeTarget, this.options);
    if (commandRenderer.isErr()) {
      return err(commandRenderer.error);
    }
    const volumeName = dockerVolumeNameForStorageVolumeId(input.source.storageVolumeId);
    if (volumeName.isErr()) {
      return err(volumeName.error);
    }

    const script = commandRenderer.value.renderDockerVolumeTarBackup({
      storageVolumeId: input.source.storageVolumeId,
      dockerVolumeName: volumeName.value,
      backupId: input.backupId,
      attemptId: input.attemptId,
      workingRoot: this.options.workingRoot ?? defaultStorageBackupWorkingRoot,
    });
    const result = await runStorageBackupScript(input.runtimeTarget, script);
    if (result.failed) {
      return err(
        backupCommandError("Storage volume backup source command failed", {
          phase: "storage-volume-backup-source",
          backupId: input.backupId,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        }),
      );
    }

    return parseSourceOutput({
      stdout: result.stdout,
      backupId: input.backupId,
      timedOut: result.timedOut,
    });
  }
}

export class DockerSqliteOnlineStorageBackupSourceAdapter implements StorageBackupSourceAdapterPort {
  readonly key = "sqlite-online-backup";

  constructor(private readonly options: StorageBackupRuntimeProviderOptions = {}) {}

  supports(input: Parameters<StorageBackupSourceAdapterPort["supports"]>[0]): boolean {
    return (
      input.source.dataFormat === "sqlite" &&
      input.requestedConsistency === "application-consistent"
    );
  }

  async createBackup(
    input: StorageBackupExecutionRequest,
  ): Promise<Result<StorageBackupSourceResult>> {
    const commandRenderer = resolveRuntimeCommandRenderer(input.runtimeTarget, this.options);
    if (commandRenderer.isErr()) {
      return err(commandRenderer.error);
    }
    const volumeName = dockerVolumeNameForStorageVolumeId(input.source.storageVolumeId);
    if (volumeName.isErr()) {
      return err(volumeName.error);
    }

    const script = commandRenderer.value.renderDockerVolumeSqliteOnlineBackup({
      storageVolumeId: input.source.storageVolumeId,
      dockerVolumeName: volumeName.value,
      backupId: input.backupId,
      attemptId: input.attemptId,
      sqliteHelperImage: this.options.sqliteHelperImage ?? defaultSqliteHelperImage,
      workingRoot: this.options.workingRoot ?? defaultStorageBackupWorkingRoot,
    });
    const result = await runStorageBackupScript(input.runtimeTarget, script);
    if (result.failed) {
      return err(
        backupCommandError("SQLite storage volume backup source command failed", {
          phase: "storage-volume-backup-source",
          backupId: input.backupId,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        }),
      );
    }

    return parseSourceOutput({
      stdout: result.stdout,
      backupId: input.backupId,
      timedOut: result.timedOut,
    });
  }
}

export class LocalFilesystemStorageBackupTargetProvider implements StorageBackupTargetProviderPort {
  readonly key = "local-filesystem";

  constructor(private readonly options: StorageBackupRuntimeProviderOptions = {}) {}

  localOnly(): boolean {
    return true;
  }

  supports(input: Parameters<StorageBackupTargetProviderPort["supports"]>[0]): boolean {
    return input.target.providerKey === "local-filesystem";
  }

  async store(
    input: StorageBackupTargetStoreRequest,
  ): Promise<Result<StorageBackupTargetStoreResult>> {
    const commandRenderer = resolveRuntimeCommandRenderer(input.runtimeTarget, this.options);
    if (commandRenderer.isErr()) {
      return err(commandRenderer.error);
    }

    const script = commandRenderer.value.renderLocalFilesystemStoreBackup({
      sourceRef: input.sourceResult.sourceRef,
      storageVolumeId: input.plan.storageVolumeId,
      backupId: input.backupId,
      targetRef: input.target.targetRef,
      retentionMaxCount: input.plan.retention.maxCount,
    });
    const result = await runStorageBackupScript(input.runtimeTarget, script);
    if (result.failed) {
      return err(
        backupCommandError("Storage volume backup target command failed", {
          phase: "storage-volume-backup-target",
          backupId: input.backupId,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        }),
      );
    }

    return parseStoreOutput({
      stdout: result.stdout,
      backupId: input.backupId,
      timedOut: result.timedOut,
    });
  }

  async restore(
    input: StorageBackupTargetRestoreRequest,
  ): Promise<Result<StorageBackupTargetRestoreResult>> {
    const commandRenderer = resolveRuntimeCommandRenderer(input.runtimeTarget, this.options);
    if (commandRenderer.isErr()) {
      return err(commandRenderer.error);
    }

    const targetVolumeName = dockerVolumeNameForStorageVolumeId(input.targetStorageVolumeId);
    if (targetVolumeName.isErr()) {
      return err(targetVolumeName.error);
    }

    const artifactHandle = sourceRefFromArtifactHandle(input.artifactHandle);
    if (!artifactHandle) {
      return err(
        domainError.validation("Storage volume backup artifact handle is required", {
          phase: "storage-volume-restore-target",
          backupId: input.backupId,
        }),
      );
    }

    const script = commandRenderer.value.renderLocalFilesystemRestoreBackup({
      artifactHandle,
      targetStorageVolumeId: input.targetStorageVolumeId,
      targetDockerVolumeName: targetVolumeName.value,
    });
    const result = await runStorageBackupScript(input.runtimeTarget, script);
    if (result.failed) {
      return err(
        backupCommandError("Storage volume restore target command failed", {
          phase: "storage-volume-restore-target",
          backupId: input.backupId,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        }),
      );
    }

    return parseRestoreOutput({
      stdout: result.stdout,
      backupId: input.backupId,
      timedOut: result.timedOut,
    });
  }
}

export class S3CompatibleStorageBackupTargetProvider implements StorageBackupTargetProviderPort {
  readonly key = "s3-compatible";

  constructor(
    private readonly broker: StorageBackupObjectTransferBrokerPort,
    private readonly options: StorageBackupRuntimeProviderOptions = {},
  ) {}

  localOnly(): boolean {
    return false;
  }

  supports(input: Parameters<StorageBackupTargetProviderPort["supports"]>[0]): boolean {
    return (
      input.target.providerKey === "s3-compatible" &&
      safeS3CompatibleTargetRef(input.target.targetRef)
    );
  }

  async store(
    input: StorageBackupTargetStoreRequest,
  ): Promise<Result<StorageBackupTargetStoreResult>> {
    if (!safeS3CompatibleTargetRef(input.target.targetRef)) {
      return err(
        domainError.validation("S3-compatible backup target reference is unsafe", {
          phase: "storage-volume-backup-target-authorization",
          backupId: input.backupId,
        }),
      );
    }
    const commandRenderer = resolveRuntimeCommandRenderer(input.runtimeTarget, this.options);
    if (commandRenderer.isErr()) {
      return err(commandRenderer.error);
    }
    if (!commandRenderer.value.renderS3CompatibleStoreBackup) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Storage backup runtime dialect cannot upload S3-compatible artifacts",
          {
            phase: "storage-volume-backup-runtime-dialect",
            backupId: input.backupId,
            commandDialect: commandRenderer.value.key,
            missingCapability: "storage.volume-backup.s3-compatible.store",
          },
        ),
      );
    }
    const authorized = await this.broker.authorizeUpload({
      backupId: input.backupId,
      target: input.target,
      ...(input.sourceResult.manifest ? { sourceManifest: input.sourceResult.manifest } : {}),
    });
    if (authorized.isErr()) {
      return err(authorized.error);
    }
    if (!safeS3CompatibleArtifactHandle(authorized.value.artifactHandle)) {
      return err(
        domainError.validation("S3-compatible backup artifact handle is unsafe", {
          phase: "storage-volume-backup-target-authorization",
          backupId: input.backupId,
        }),
      );
    }
    const transfer = validateTransferAuthorization(
      authorized.value,
      "storage-volume-backup-target-authorization",
      input.backupId,
    );
    if (transfer.isErr()) {
      return err(transfer.error);
    }
    const script = commandRenderer.value.renderS3CompatibleStoreBackup({
      sourceRef: input.sourceResult.sourceRef,
      artifactHandle: authorized.value.artifactHandle,
      uploadUrl: authorized.value.url,
      ...(authorized.value.headers ? { headers: authorized.value.headers } : {}),
      backupId: input.backupId,
    });
    const result = await runStorageBackupScript(
      input.runtimeTarget,
      script,
      transferAuthorizationRedactions(authorized.value),
    );
    if (result.failed) {
      return err(
        backupCommandError("S3-compatible storage volume backup upload failed", {
          phase: "storage-volume-backup-target",
          backupId: input.backupId,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        }),
      );
    }
    return parseStoreOutput({
      stdout: result.stdout,
      backupId: input.backupId,
      timedOut: result.timedOut,
    });
  }

  async restore(
    input: StorageBackupTargetRestoreRequest,
  ): Promise<Result<StorageBackupTargetRestoreResult>> {
    if (!safeS3CompatibleArtifactHandle(input.artifactHandle)) {
      return err(
        domainError.validation("S3-compatible backup artifact handle is unsafe", {
          phase: "storage-volume-restore-target-authorization",
          backupId: input.backupId,
        }),
      );
    }
    const commandRenderer = resolveRuntimeCommandRenderer(input.runtimeTarget, this.options);
    if (commandRenderer.isErr()) {
      return err(commandRenderer.error);
    }
    if (!commandRenderer.value.renderS3CompatibleRestoreBackup) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Storage backup runtime dialect cannot restore S3-compatible artifacts",
          {
            phase: "storage-volume-backup-runtime-dialect",
            backupId: input.backupId,
            commandDialect: commandRenderer.value.key,
            missingCapability: "storage.volume-backup.s3-compatible.restore",
          },
        ),
      );
    }
    const targetVolumeName = dockerVolumeNameForStorageVolumeId(input.targetStorageVolumeId);
    if (targetVolumeName.isErr()) {
      return err(targetVolumeName.error);
    }
    const authorized = await this.broker.authorizeDownload({
      backupId: input.backupId,
      artifactHandle: input.artifactHandle,
    });
    if (authorized.isErr()) {
      return err(authorized.error);
    }
    const transfer = validateTransferAuthorization(
      authorized.value,
      "storage-volume-restore-target-authorization",
      input.backupId,
    );
    if (transfer.isErr()) {
      return err(transfer.error);
    }
    const script = commandRenderer.value.renderS3CompatibleRestoreBackup({
      artifactHandle: input.artifactHandle,
      downloadUrl: authorized.value.url,
      ...(authorized.value.headers ? { headers: authorized.value.headers } : {}),
      ...(input.expectedChecksum ? { expectedChecksum: input.expectedChecksum } : {}),
      backupId: input.backupId,
      restoreAttemptId: input.restoreAttemptId,
      workingRoot: this.options.workingRoot ?? defaultStorageBackupWorkingRoot,
      targetStorageVolumeId: input.targetStorageVolumeId,
      targetDockerVolumeName: targetVolumeName.value,
    });
    const result = await runStorageBackupScript(
      input.runtimeTarget,
      script,
      transferAuthorizationRedactions(authorized.value),
    );
    if (result.failed) {
      return err(
        backupCommandError("S3-compatible storage volume backup download or restore failed", {
          phase: "storage-volume-restore-target",
          backupId: input.backupId,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        }),
      );
    }
    return parseRestoreOutput({
      stdout: result.stdout,
      backupId: input.backupId,
      timedOut: result.timedOut,
    });
  }

  async prune(
    input: Parameters<NonNullable<StorageBackupTargetProviderPort["prune"]>>[0],
  ): Promise<Result<{ prunedAt: string }>> {
    if (!input.artifactHandle || !safeS3CompatibleArtifactHandle(input.artifactHandle)) {
      return err(
        domainError.validation("S3-compatible backup artifact handle is required", {
          phase: "storage-volume-backup-prune-target",
          backupId: input.backupId,
        }),
      );
    }
    const deleted = await this.broker.deleteObject({
      backupId: input.backupId,
      artifactHandle: input.artifactHandle,
      requestedAt: input.requestedAt,
    });
    return deleted.isErr() ? err(deleted.error) : ok({ prunedAt: deleted.value.deletedAt });
  }
}

export class RuntimeStorageBackupProviderRegistry implements StorageBackupProviderRegistryPort {
  private readonly sources: readonly StorageBackupSourceAdapterPort[];
  private readonly targets: readonly StorageBackupTargetProviderPort[];

  constructor(options: StorageBackupRuntimeProviderOptions = {}) {
    this.sources = [
      new DockerSqliteOnlineStorageBackupSourceAdapter(options),
      new DockerTarStorageBackupSourceAdapter(options),
    ];
    this.targets = [
      new LocalFilesystemStorageBackupTargetProvider(options),
      ...(options.objectTransferBroker
        ? [new S3CompatibleStorageBackupTargetProvider(options.objectTransferBroker, options)]
        : []),
    ];
  }

  sourceAdapters(): readonly StorageBackupSourceAdapterPort[] {
    return this.sources;
  }

  targetProviders(): readonly StorageBackupTargetProviderPort[] {
    return this.targets;
  }
}
