import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ExecutionContext,
  type StorageRuntimeCleaner,
  type StorageRuntimeCleanupBlockedReason,
  type StorageRuntimeCleanupCandidate,
  type StorageRuntimeCleanupResult,
  type StorageRuntimeCleanupWarning,
} from "@appaloft/application";
import { type AshScript, ash } from "@appaloft/ash";
import { type DeploymentTargetState, domainError, err, ok, type Result } from "@appaloft/core";
import { runBufferedProcess, shellCommand } from "./buffered-process";
import { dockerVolumeNameForStorageVolumeId } from "./storage-runtime-mounts";

interface PreparedSshArgs {
  args: string[];
  cleanup(): void;
}

interface StorageCleanupCommandResult {
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
}

const defaultRemoteRuntimeRoot = "/var/lib/appaloft/runtime";
const storageRuntimeCleanupBlockedReasons = new Set<StorageRuntimeCleanupBlockedReason>([
  "active-attachment",
  "active-runtime",
  "backup-restore-in-flight",
  "backup-retention",
  "bind-mount-unsupported",
  "cutoff-not-reached",
  "ownership-unproven",
  "provider-blocked",
  "retained-snapshot",
  "rollback-candidate",
  "safety-evidence-missing",
]);

function isStorageRuntimeCleanupBlockedReason(
  input: string | undefined,
): input is StorageRuntimeCleanupBlockedReason {
  return (
    input !== undefined &&
    storageRuntimeCleanupBlockedReasons.has(input as StorageRuntimeCleanupBlockedReason)
  );
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function prepareSshArgs(server: DeploymentTargetState, remoteCommand: string): PreparedSshArgs {
  const credential = server.credential;
  let tempDir: string | undefined;
  let identityArgs: string[] = [];

  if (credential?.kind.value === "ssh-private-key" && credential.privateKey) {
    tempDir = mkdtempSync(join(tmpdir(), "appaloft-storage-cleanup-ssh-"));
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

export function renderStorageRuntimeCleanupScript(input: {
  storageVolumeId: string;
  storageVolumeKind: "named-volume" | "bind-mount";
  volumeName: string;
  before: string;
  dryRun: boolean;
  activeAttachmentCount: number;
  backupRetentionRequired: boolean;
  backupRestoreInFlightCount: number;
  retainedSnapshotCount: number;
  rollbackCandidateCount: number;
}): AshScript {
  return ash`
    set +e
    ${ash.env("APPALOFT_STORAGE_VOLUME_ID", input.storageVolumeId)}
    ${ash.env("APPALOFT_STORAGE_VOLUME_KIND", input.storageVolumeKind)}
    ${ash.env("APPALOFT_DOCKER_VOLUME_NAME", input.volumeName)}
    ${ash.env("APPALOFT_STORAGE_CLEANUP_BEFORE", input.before)}
    ${ash.env("APPALOFT_STORAGE_CLEANUP_DRY_RUN", input.dryRun ? "1" : "0")}
    ${ash.env("APPALOFT_STORAGE_ACTIVE_ATTACHMENT_COUNT", input.activeAttachmentCount)}
    ${ash.env("APPALOFT_STORAGE_BACKUP_RETENTION_REQUIRED", input.backupRetentionRequired ? "1" : "0")}
    ${ash.env("APPALOFT_STORAGE_BACKUP_RESTORE_IN_FLIGHT_COUNT", input.backupRestoreInFlightCount)}
    ${ash.env("APPALOFT_STORAGE_RETAINED_SNAPSHOT_COUNT", input.retainedSnapshotCount)}
    ${ash.env("APPALOFT_STORAGE_ROLLBACK_CANDIDATE_COUNT", input.rollbackCandidateCount)}
    ${ash.raw(`printf 'APPALOFT_STORAGE_CLEANUP_V1\\n'
    emit_candidate() {
      id="$1"; kind="$2"; target="$3"; updated_at="$4"; action="$5"; reason="$6"
      printf 'STORAGE_CLEANUP_CANDIDATE\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$id" "$kind" "$target" "$updated_at" "$action" "$reason"
    }
    older_than_cutoff() {
      candidate_time="$1"
      [ -n "$candidate_time" ] || return 1
      [ "$candidate_time" \\< "$APPALOFT_STORAGE_CLEANUP_BEFORE" ]
    }
    if [ "$APPALOFT_STORAGE_VOLUME_KIND" = "bind-mount" ]; then
      emit_candidate "$APPALOFT_STORAGE_VOLUME_ID" bind-mount "$APPALOFT_STORAGE_VOLUME_ID" "" blocked bind-mount-unsupported
      exit 0
    fi
    if ! command -v docker >/dev/null 2>&1; then
      printf 'STORAGE_CLEANUP_WARNING\\tdocker-unavailable\\tdocker command is unavailable\\n'
      exit 0
    fi
    created_at=$(docker volume inspect -f '{{.CreatedAt}}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null)
    if [ -z "$created_at" ] || [ "$created_at" = '<no value>' ]; then
      exit 0
    fi
    volume_storage_id=$(docker volume inspect -f '{{ index .Labels "appaloft.storage-volume-id" }}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null)
    volume_managed=$(docker volume inspect -f '{{ index .Labels "appaloft.managed" }}' "$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null)
    if [ "$volume_storage_id" != "$APPALOFT_STORAGE_VOLUME_ID" ] || [ "$volume_managed" != "true" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked ownership-unproven
      exit 0
    fi
    active_container=$(docker ps -q --filter "volume=$APPALOFT_DOCKER_VOLUME_NAME" 2>/dev/null | head -n 1)
    if [ -n "$active_container" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked active-runtime
      exit 0
    fi
    if [ "$APPALOFT_STORAGE_ACTIVE_ATTACHMENT_COUNT" != "0" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked active-attachment
      exit 0
    fi
    if [ "$APPALOFT_STORAGE_RETAINED_SNAPSHOT_COUNT" != "0" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked retained-snapshot
      exit 0
    fi
    if [ "$APPALOFT_STORAGE_ROLLBACK_CANDIDATE_COUNT" != "0" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked rollback-candidate
      exit 0
    fi
    if [ "$APPALOFT_STORAGE_BACKUP_RESTORE_IN_FLIGHT_COUNT" != "0" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked backup-restore-in-flight
      exit 0
    fi
    if [ "$APPALOFT_STORAGE_BACKUP_RETENTION_REQUIRED" = "1" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked backup-retention
      exit 0
    fi
    if ! older_than_cutoff "$created_at"; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" skipped cutoff-not-reached
      exit 0
    fi
    if [ "$APPALOFT_STORAGE_CLEANUP_DRY_RUN" = "1" ]; then
      emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" matched ""
    else
      docker volume rm "$APPALOFT_DOCKER_VOLUME_NAME" >/dev/null 2>&1
      if [ "$?" = "0" ]; then
        emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" cleaned ""
      else
        emit_candidate "$APPALOFT_DOCKER_VOLUME_NAME" named-volume "$APPALOFT_DOCKER_VOLUME_NAME" "$created_at" blocked provider-blocked
      fi
    fi`)}
  `;
}

async function runLocalStorageCleanupScript(script: AshScript): Promise<StorageCleanupCommandResult> {
  const result = await runBufferedProcess({
    command: shellCommand(ash.render(script)),
    timeoutMs: 20_000,
    timeoutMessage: "Storage runtime cleanup timed out",
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    timedOut: result.timedOut,
  };
}

async function runSshStorageCleanupScript(
  server: DeploymentTargetState,
  script: AshScript,
): Promise<StorageCleanupCommandResult> {
  const prepared = prepareSshArgs(server, ash.render(script));
  try {
    const result = await runBufferedProcess({
      command: ["ssh", ...prepared.args],
      timeoutMs: 30_000,
      timeoutMessage: "Storage runtime cleanup SSH command timed out",
      redactions: [server.credential?.privateKey?.value ?? ""],
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

export function parseStorageRuntimeCleanupOutput(input: {
  stdout: string;
  server: DeploymentTargetState;
  storageVolume: Parameters<StorageRuntimeCleaner["cleanup"]>[1]["storageVolume"];
  before: string;
  dryRun: boolean;
  cleanedAt: string;
  timedOut: boolean;
}): Result<StorageRuntimeCleanupResult> {
  const lines = input.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.includes("APPALOFT_STORAGE_CLEANUP_V1")) {
    return err(
      domainError.infra("Storage runtime cleanup output was not recognized", {
        phase: "storage-runtime-cleanup",
      }),
    );
  }

  const candidates: StorageRuntimeCleanupCandidate[] = [];
  const warnings: StorageRuntimeCleanupWarning[] = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts[0] === "STORAGE_CLEANUP_CANDIDATE") {
      const [, id, kind, target, updatedAt, action, blockedReason] = parts;
      if (
        id &&
        (kind === "named-volume" || kind === "bind-mount") &&
        target &&
        (action === "matched" || action === "cleaned" || action === "skipped" || action === "blocked")
      ) {
        const safeBlockedReason = isStorageRuntimeCleanupBlockedReason(blockedReason)
          ? blockedReason
          : undefined;
        candidates.push({
          id,
          kind,
          target,
          updatedAt: updatedAt || null,
          action,
          ...(safeBlockedReason ? { blockedReason: safeBlockedReason } : {}),
        });
      }
      continue;
    }

    if (parts[0] === "STORAGE_CLEANUP_WARNING") {
      const [, code, message] = parts;
      warnings.push({
        code: code ?? "unknown",
        message: message ?? "Storage runtime cleanup warning",
      });
    }
  }

  if (input.timedOut) {
    warnings.push({
      code: "target-timeout",
      message: "Storage runtime cleanup timed out before all candidates could be inspected.",
    });
  }

  return ok({
    schemaVersion: "storage-volumes.cleanup-runtime/v1",
    storageVolume: {
      id: input.storageVolume.id.value,
      name: input.storageVolume.name.value,
      kind: input.storageVolume.kind.value,
    },
    server: {
      id: input.server.id.value,
      name: input.server.name.value,
      host: input.server.host.value,
      port: input.server.port.value,
      providerKey: input.server.providerKey.value,
      targetKind: input.server.targetKind.value,
    },
    before: input.before,
    dryRun: input.dryRun,
    cleanedAt: input.cleanedAt,
    summary: {
      inspectedCount: candidates.length,
      matchedCount: candidates.filter((candidate) => candidate.action === "matched").length,
      cleanedCount: candidates.filter((candidate) => candidate.action === "cleaned").length,
      skippedCount: candidates.filter((candidate) => candidate.action === "skipped").length,
      blockedCount: candidates.filter((candidate) => candidate.action === "blocked").length,
    },
    candidates,
    warnings,
  });
}

export class StorageRuntimeCleanerAdapter implements StorageRuntimeCleaner {
  constructor(
    private readonly localRuntimeRoot: string,
    private readonly remoteRuntimeRoot = defaultRemoteRuntimeRoot,
  ) {}

  async cleanup(
    _context: ExecutionContext,
    input: Parameters<StorageRuntimeCleaner["cleanup"]>[1],
  ): Promise<Result<StorageRuntimeCleanupResult>> {
    void this.localRuntimeRoot;
    void this.remoteRuntimeRoot;
    const providerKey = input.server.providerKey.value;
    if (providerKey !== "local-shell" && providerKey !== "generic-ssh") {
      return err(
        domainError.runtimeTargetUnsupported("Storage runtime cleanup is unsupported", {
          phase: "storage-runtime-cleanup",
          serverId: input.server.id.value,
          providerKey,
          targetKind: input.server.targetKind.value,
          missingCapability: "storage.runtime-cleanup",
        }),
      );
    }

    const volumeName = dockerVolumeNameForStorageVolumeId(input.storageVolume.id.value);
    if (volumeName.isErr()) {
      return err(volumeName.error);
    }

    const script = renderStorageRuntimeCleanupScript({
      storageVolumeId: input.storageVolume.id.value,
      storageVolumeKind: input.storageVolume.kind.value,
      volumeName: volumeName.value,
      before: input.before,
      dryRun: input.dryRun,
      activeAttachmentCount: input.safetyEvidence.activeAttachmentCount,
      backupRetentionRequired: input.safetyEvidence.backupRetentionRequired,
      backupRestoreInFlightCount: input.safetyEvidence.backupRestoreInFlightCount,
      retainedSnapshotCount: input.safetyEvidence.retainedSnapshotCount,
      rollbackCandidateCount: input.safetyEvidence.rollbackCandidateCount,
    });
    const result =
      providerKey === "generic-ssh"
        ? await runSshStorageCleanupScript(input.server, script)
        : await runLocalStorageCleanupScript(script);

    const parsed = parseStorageRuntimeCleanupOutput({
      stdout: result.stdout,
      server: input.server,
      storageVolume: input.storageVolume,
      before: input.before,
      dryRun: input.dryRun,
      cleanedAt: new Date().toISOString(),
      timedOut: result.timedOut,
    });
    if (parsed.isOk()) {
      return parsed;
    }

    return err(
      domainError.infra("Storage runtime cleanup failed", {
        phase: "storage-runtime-cleanup",
        serverId: input.server.id.value,
        providerKey,
        stderr: result.failed ? result.stderr.slice(0, 240) : "",
      }),
    );
  }
}
