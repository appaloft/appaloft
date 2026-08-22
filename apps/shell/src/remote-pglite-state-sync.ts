import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  buildSshRemoteStateProcessArgs,
  parseServerStateBackendMarker,
  SshRemoteStateLifecycle,
  type SshRemoteStateTarget,
  serverStateBackendMarkerFile,
  serverStateBackendMarkerSchemaVersion,
  serverStateBackendMismatchError,
} from "@appaloft/adapter-cli";
import { ash } from "@appaloft/ash";
import { type AppConfig, resolveConfig } from "@appaloft/config";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import {
  type PgliteRuntimeAssets,
  supportedPglitePostgresMajorVersion,
} from "@appaloft/persistence-pg";
import { mergeRemotePgliteState } from "./pglite-remote-state-merge";

export interface RemotePgliteStateSyncPlan {
  dataRoot: string;
  localDataRoot: string;
  localPgliteDataDir: string;
  backupRetentionDays: number;
  backupMaxCount: number;
  target: SshRemoteStateTarget;
  readOnly?: boolean;
}

export interface RemotePgliteStateSyncSession extends RemotePgliteStateSyncPlan {
  releaseForCliRuntime(): Promise<Result<void>>;
  refreshLocalMirror(): Promise<Result<void>>;
  discardAndRelease(): Promise<Result<void>>;
  syncBackAndRelease(): Promise<Result<void>>;
}

export interface RemotePgliteArchiveRunnerInput {
  command: string;
  args: string[];
  stdin?: Uint8Array;
  redactions?: readonly string[];
}

export interface RemotePgliteArchiveRunnerResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: string;
  failed: boolean;
}

export interface RemotePgliteArchiveRunner {
  run(input: RemotePgliteArchiveRunnerInput): RemotePgliteArchiveRunnerResult;
  runToFile?(
    input: RemotePgliteArchiveRunnerInput,
    outputPath: string,
  ): Promise<RemotePgliteArchiveRunnerResult> | RemotePgliteArchiveRunnerResult;
  runFromFile?(
    input: RemotePgliteArchiveRunnerInput,
    inputPath: string,
  ): Promise<RemotePgliteArchiveRunnerResult> | RemotePgliteArchiveRunnerResult;
}

interface LifecycleRunnerInput {
  target: SshRemoteStateTarget;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}

interface LifecycleRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
}

interface PendingRemotePgliteSync {
  schemaVersion: "remote-pglite-pending-sync/v1";
  targetFingerprint: string;
  expectedRevision: number;
  nextRevision: number;
  baseSnapshotRoot: string;
  uploadDataRoot: string;
  recordedAt: string;
}

interface LifecycleRunner {
  run(input: LifecycleRunnerInput): Promise<LifecycleRunnerResult> | LifecycleRunnerResult;
}

export interface PrepareRemotePgliteStateSyncInput {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  config?: AppConfig;
  pgliteRuntimeAssets?: PgliteRuntimeAssets;
  runner?: RemotePgliteArchiveRunner;
  readDirectory?: (path: string) => Promise<string[]>;
}

const explicitLocalStateBackends = new Set(["local-pglite", "postgres-control-plane"]);
const remoteStateRevisionConflictExitCode = 76;
const remotePgliteMaintenanceLockStaleAfterMs = 3 * 60_000;

function readOption(argv: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === name) {
      return argv[index + 1];
    }

    if (value?.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }

  return undefined;
}

function cliCommandArgs(argv: readonly string[]): readonly string[] {
  const appaloftIndex = argv.indexOf("appaloft");
  let args =
    appaloftIndex >= 0 ? argv.slice(appaloftIndex + 1) : argv.length > 2 ? argv.slice(2) : argv;
  if (args[0] === "--") args = args.slice(1);

  while (
    args[0] === "--control-plane-mode" ||
    args[0] === "--control-plane-url" ||
    args[0] === "--control-plane-profile"
  ) {
    args = args.slice(2);
  }
  while (
    args[0]?.startsWith("--control-plane-mode=") ||
    args[0]?.startsWith("--control-plane-url=") ||
    args[0]?.startsWith("--control-plane-profile=")
  ) {
    args = args.slice(1);
  }

  return args;
}

function hasDeployCommand(argv: readonly string[]): boolean {
  const command = cliCommandArgs(argv)[0];
  return command === "up" || command === "deploy";
}

function hasSourceLinkRelinkCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "source-links" && args[1] === "relink";
}

function hasPreviewCleanupCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "preview" && args[1] === "cleanup";
}

function hasSecretRotationCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "db" && args[1] === "secret-rotation";
}

function hasSecretRotationPlanCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "db" && args[1] === "secret-rotation" && args[2] === "plan";
}

function hasDbMigrateCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "db" && args[1] === "migrate";
}

function hasEnvironmentVariableMutationCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "env" && (args[1] === "set" || args[1] === "unset");
}

function hasServerCapacityCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return (
    args[0] === "server" && args[1] === "capacity" && (args[2] === "inspect" || args[2] === "prune")
  );
}

function hasServerCapacityInspectCommand(argv: readonly string[]): boolean {
  const args = cliCommandArgs(argv);
  return args[0] === "server" && args[1] === "capacity" && args[2] === "inspect";
}

function hasPendingSyncRetryOption(argv: readonly string[]): boolean {
  return argv.some(
    (value) =>
      value === "--retry-pending-state-sync" || value === "--retry-pending-state-sync=true",
  );
}

function requiresRemotePgliteStateCommand(argv: readonly string[]): boolean {
  return (
    hasDeployCommand(argv) ||
    hasSourceLinkRelinkCommand(argv) ||
    hasPreviewCleanupCommand(argv) ||
    hasSecretRotationCommand(argv) ||
    hasDbMigrateCommand(argv) ||
    hasEnvironmentVariableMutationCommand(argv) ||
    hasServerCapacityCommand(argv)
  );
}

function safeTargetKey(target: SshRemoteStateTarget, dataRoot: string): string {
  const rootDigest = createHash("sha256").update(dataRoot).digest("hex").slice(0, 12);
  return [target.username ?? "ssh", target.host, String(target.port ?? 22), rootDigest]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function remoteTargetFingerprint(target: SshRemoteStateTarget, dataRoot: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        host: target.host,
        port: target.port ?? 22,
        username: target.username ?? null,
        identityFile: target.identityFile ? resolve(target.identityFile) : null,
        dataRoot,
      }),
    )
    .digest("hex");
}

function sshTargetFromArgv(argv: readonly string[]): Result<SshRemoteStateTarget | null> {
  const host = readOption(argv, "--server-host");
  if (!host) {
    return ok(null);
  }

  const portValue = readOption(argv, "--server-port");
  const parsedPort = portValue === undefined ? undefined : Number(portValue);
  if (
    parsedPort !== undefined &&
    (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535)
  ) {
    return err(
      domainError.validation("SSH remote PGlite target port must be an integer from 1 to 65535", {
        phase: "remote-state-resolution",
        stateBackend: "ssh-pglite",
      }),
    );
  }
  const username = readOption(argv, "--server-ssh-username");
  const identityFile = readOption(argv, "--server-ssh-private-key-file");

  return ok({
    host,
    ...(parsedPort === undefined ? {} : { port: parsedPort }),
    ...(username ? { username } : {}),
    ...(identityFile ? { identityFile } : {}),
  });
}

function hasExplicitDestructiveCapacityPrune(argv: readonly string[]): boolean {
  return (
    hasServerCapacityCommand(argv) &&
    !hasServerCapacityInspectCommand(argv) &&
    readOption(argv, "--dry-run") === "false"
  );
}

function errorDetails(input: {
  phase: string;
  target: SshRemoteStateTarget;
  exitCode?: number;
  stderr?: string;
}): Record<string, string | number | boolean | null> {
  return {
    phase: input.phase,
    stateBackend: "ssh-pglite",
    host: input.target.host,
    port: String(input.target.port ?? 22),
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
    ...(input.stderr?.trim() ? { stderr: input.stderr.trim().slice(0, 2_000) } : {}),
  };
}

function parseRemoteRevision(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function verifyReadOnlyPgliteMajorVersion(
  plan: RemotePgliteStateSyncPlan,
): Promise<Result<void>> {
  let sourceMajor: string;
  try {
    sourceMajor = (await readFile(join(plan.localPgliteDataDir, "PG_VERSION"), "utf8")).trim();
  } catch {
    return err(
      domainError.infra("SSH remote PGlite PostgreSQL major version could not be verified", {
        ...errorDetails({
          phase: "remote-state-sync-download",
          target: plan.target,
        }),
        reason: "remote_pglite_postgres_major_unavailable",
      }),
    );
  }

  if (!/^\d+$/.test(sourceMajor)) {
    return err(
      domainError.infra("SSH remote PGlite PostgreSQL major version is invalid", {
        ...errorDetails({
          phase: "remote-state-sync-download",
          target: plan.target,
        }),
        reason: "remote_pglite_postgres_major_invalid",
      }),
    );
  }

  if (sourceMajor !== supportedPglitePostgresMajorVersion) {
    return err(
      domainError.infra("SSH remote PGlite PostgreSQL major version requires migration", {
        ...errorDetails({
          phase: "remote-state-sync-download",
          target: plan.target,
        }),
        reason: "remote_pglite_postgres_major_incompatible",
        sourcePostgresMajor: sourceMajor,
        requiredPostgresMajor: supportedPglitePostgresMajorVersion,
      }),
    );
  }

  return ok(undefined);
}

function parseRemoteRevisionConflict(
  stderr: string,
): { expectedRevision?: number; actualRevision?: number } | null {
  const trimmedValue = stderr.trim();
  if (!trimmedValue.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      expectedRevision?: unknown;
      actualRevision?: unknown;
    };

    return {
      ...(typeof parsed.expectedRevision === "number"
        ? { expectedRevision: parsed.expectedRevision }
        : {}),
      ...(typeof parsed.actualRevision === "number"
        ? { actualRevision: parsed.actualRevision }
        : {}),
    };
  } catch {
    return null;
  }
}

function remoteArchiveCommand(dataRoot: string, readOnly: boolean): string {
  if (readOnly) {
    return [
      "set -eu",
      `data_root=${ash.quote(dataRoot)}`,
      'lock_dir="$data_root/locks/mutation.lock"',
      'revision_file="$data_root/sync-revision.txt"',
      'test -d "$data_root/pglite"',
      '[ ! -d "$lock_dir" ]',
      'revision_before=0; if [ -f "$revision_file" ]; then revision_before="$(cat "$revision_file" 2>/dev/null || printf "0")"; fi',
      'cd "$data_root"',
      "tar -czf - pglite source-links server-applied-routes",
      'revision_after=0; if [ -f "$revision_file" ]; then revision_after="$(cat "$revision_file" 2>/dev/null || printf "0")"; fi',
      '[ ! -d "$lock_dir" ] && [ "$revision_before" = "$revision_after" ]',
    ].join("; ");
  }

  return [
    `mkdir -p ${ash.quote(dataRoot)}/pglite ${ash.quote(dataRoot)}/source-links ${ash.quote(dataRoot)}/server-applied-routes`,
    `cd ${ash.quote(dataRoot)}`,
    "tar -czf - pglite source-links server-applied-routes",
  ].join(" && ");
}

function remoteRevisionReadCommand(dataRoot: string, readOnly: boolean): string {
  const quotedDataRoot = ash.quote(dataRoot);

  return [
    `data_root=${quotedDataRoot}`,
    'revision_file="$data_root/sync-revision.txt"',
    ...(readOnly ? [] : ['mkdir -p "$data_root"']),
    'if [ -f "$revision_file" ]; then cat "$revision_file"; else printf "0\\n"; fi',
  ].join("; ");
}

function remoteControlPlaneBackendMarkerEnsureCommand(dataRoot: string): string {
  const quotedDataRoot = ash.quote(dataRoot);

  return [
    `data_root=${quotedDataRoot}`,
    `backend_marker="$data_root/${serverStateBackendMarkerFile}"`,
    'mkdir -p "$data_root"',
    'if [ ! -f "$backend_marker" ]; then now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"; printf \'{"schemaVersion":"%s","stateBackend":"postgres-control-plane","updatedAt":"%s","owner":"appaloft-control-plane"}\\n\' ' +
      `${ash.quote(serverStateBackendMarkerSchemaVersion)} "$now" > "$backend_marker"; fi`,
    'cat "$backend_marker"',
  ].join("; ");
}

function remoteExtractCommand(input: {
  dataRoot: string;
  expectedRevision: number;
  nextRevision: number;
  backupRetentionDays: number;
  backupMaxCount: number;
}): string {
  const quotedDataRoot = ash.quote(input.dataRoot);

  return [
    `data_root=${quotedDataRoot}`,
    `expected_revision=${ash.quote(String(input.expectedRevision))}`,
    `next_revision=${ash.quote(String(input.nextRevision))}`,
    `backup_retention_days=${ash.quote(String(input.backupRetentionDays))}`,
    `backup_max_count=${ash.quote(String(input.backupMaxCount))}`,
    'backup_dir="$data_root/backups/sync-$(date +%Y%m%d%H%M%S)-$$"',
    'incoming_dir="$data_root/.incoming-sync-$$"',
    'recovery_file="$data_root/recovery/remote-sync-upload.json"',
    'revision_file="$data_root/sync-revision.txt"',
    'restore_backup() { rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes"; [ ! -d "$backup_dir/pglite" ] || cp -a "$backup_dir/pglite" "$data_root/pglite"; [ ! -d "$backup_dir/source-links" ] || cp -a "$backup_dir/source-links" "$data_root/source-links"; [ ! -d "$backup_dir/server-applied-routes" ] || cp -a "$backup_dir/server-applied-routes" "$data_root/server-applied-routes"; }',
    'write_recovery() { printf \'{"phase":"remote-state-sync-upload","backup":"%s"}\\n\' "$backup_dir" > "$recovery_file"; }',
    'path_mtime_epoch() { date -r "$1" +%s 2>/dev/null || stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || printf ""; }',
    'prune_old_sync_backups() { [ -d "$data_root/backups" ] || return 0; now_epoch=$(date +%s); retention_seconds=$((backup_retention_days * 86400)); for candidate in "$data_root"/backups/sync-*; do [ -d "$candidate" ] || continue; [ "$candidate" != "$backup_dir" ] || continue; updated_epoch=$(path_mtime_epoch "$candidate"); [ -n "$updated_epoch" ] || continue; age_seconds=$((now_epoch - updated_epoch)); [ "$age_seconds" -gt "$retention_seconds" ] || continue; rm -rf "$candidate"; done; count=0; for candidate in $(ls -1dt "$data_root"/backups/sync-* 2>/dev/null); do [ -d "$candidate" ] || continue; count=$((count + 1)); [ "$count" -le "$backup_max_count" ] && continue; [ "$candidate" != "$backup_dir" ] || continue; rm -rf "$candidate"; done; }',
    'mkdir -p "$data_root" "$data_root/backups" "$data_root/recovery"',
    "current_revision=0",
    'if [ -f "$revision_file" ]; then current_revision="$(cat "$revision_file" 2>/dev/null || printf "0")"; fi',
    '[ -n "$current_revision" ] || current_revision=0',
    'if [ "$current_revision" != "$expected_revision" ]; then printf \'{"phase":"remote-state-sync-upload","reason":"remote_state_revision_conflict","expectedRevision":%s,"actualRevision":%s}\\n\' "$expected_revision" "$current_revision" >&2; exit 76; fi',
    'rm -rf "$incoming_dir"',
    'mkdir -p "$incoming_dir"',
    'if [ -d "$data_root/pglite" ] || [ -d "$data_root/source-links" ] || [ -d "$data_root/server-applied-routes" ]; then mkdir -p "$backup_dir"; [ ! -d "$data_root/pglite" ] || cp -a "$data_root/pglite" "$backup_dir/pglite"; [ ! -d "$data_root/source-links" ] || cp -a "$data_root/source-links" "$backup_dir/source-links"; [ ! -d "$data_root/server-applied-routes" ] || cp -a "$data_root/server-applied-routes" "$backup_dir/server-applied-routes"; fi',
    'if tar -xzf - -C "$incoming_dir" && [ -d "$incoming_dir/pglite" ] && [ -d "$incoming_dir/source-links" ] && [ -d "$incoming_dir/server-applied-routes" ] && rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes" && mv "$incoming_dir/pglite" "$data_root/pglite" && mv "$incoming_dir/source-links" "$data_root/source-links" && mv "$incoming_dir/server-applied-routes" "$data_root/server-applied-routes" && printf "%s\\n" "$next_revision" > "$revision_file"; then rm -rf "$incoming_dir"; prune_old_sync_backups; else status=$?; rm -rf "$incoming_dir"; restore_backup; write_recovery; exit "$status"; fi',
  ].join("; ");
}

function defaultRunner(): RemotePgliteArchiveRunner {
  function redactedStderr(input: RemotePgliteArchiveRunnerInput, stderr: string): string {
    return (input.redactions ?? []).reduce(
      (value, secret) => (secret.length > 0 ? value.replaceAll(secret, "[redacted]") : value),
      stderr,
    );
  }

  return {
    run(input) {
      const result = Bun.spawnSync([input.command, ...input.args], {
        ...(input.stdin ? { stdin: input.stdin } : {}),
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = result.stderr.toString();
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: redactedStderr(input, stderr),
        failed: !result.success,
      };
    },
    async runToFile(input, outputPath) {
      const process = Bun.spawn([input.command, ...input.args], {
        stdout: Bun.file(outputPath),
        stderr: "pipe",
      });
      const exitCode = await process.exited;
      const stderr = await new Response(process.stderr).text();

      return {
        exitCode,
        stdout: new Uint8Array(),
        stderr: redactedStderr(input, stderr),
        failed: exitCode !== 0,
      };
    },
    async runFromFile(input, inputPath) {
      const process = Bun.spawn([input.command, ...input.args], {
        stdin: Bun.file(inputPath),
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await process.exited;
      const [stdout, stderr] = await Promise.all([
        new Response(process.stdout).arrayBuffer(),
        new Response(process.stderr).text(),
      ]);

      return {
        exitCode,
        stdout: new Uint8Array(stdout),
        stderr: redactedStderr(input, stderr),
        failed: exitCode !== 0,
      };
    },
  };
}

function localTransactionRoot(localDataRoot: string, label: string): string {
  return `${localDataRoot}.${label}-${process.pid}-${Date.now()}`;
}

function pendingSyncPath(localDataRoot: string): string {
  return join(localDataRoot, "recovery", "pending-sync.json");
}

async function readPendingSync(localDataRoot: string): Promise<PendingRemotePgliteSync | null> {
  try {
    const value = JSON.parse(
      await readFile(pendingSyncPath(localDataRoot), "utf8"),
    ) as Partial<PendingRemotePgliteSync>;
    if (
      value.schemaVersion !== "remote-pglite-pending-sync/v1" ||
      typeof value.targetFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.targetFingerprint) ||
      !Number.isInteger(value.expectedRevision) ||
      (value.expectedRevision ?? -1) < 0 ||
      !Number.isInteger(value.nextRevision) ||
      value.nextRevision !== (value.expectedRevision ?? -2) + 1 ||
      typeof value.baseSnapshotRoot !== "string" ||
      !value.baseSnapshotRoot ||
      typeof value.uploadDataRoot !== "string" ||
      !value.uploadDataRoot ||
      typeof value.recordedAt !== "string"
    ) {
      return null;
    }
    return value as PendingRemotePgliteSync;
  } catch {
    return null;
  }
}

function validatePendingSyncPaths(
  localDataRoot: string,
  pending: PendingRemotePgliteSync,
): Result<void> {
  const normalizedLocalRoot = resolve(localDataRoot);
  const normalizedBaseRoot = resolve(pending.baseSnapshotRoot);
  const normalizedUploadRoot = resolve(pending.uploadDataRoot);
  const isGeneratedRoot = (candidate: string, label: string): boolean => {
    const prefix = `${normalizedLocalRoot}.${label}-`;
    return candidate.startsWith(prefix) && /^\d+-\d+$/.test(candidate.slice(prefix.length));
  };
  const validBaseRoot = isGeneratedRoot(normalizedBaseRoot, "base");
  const validUploadRoot =
    normalizedUploadRoot === normalizedLocalRoot ||
    isGeneratedRoot(normalizedUploadRoot, "merged") ||
    isGeneratedRoot(normalizedUploadRoot, "recovery-merged");

  return validBaseRoot && validUploadRoot
    ? ok(undefined)
    : err(
        domainError.infra("Pending SSH remote PGlite state sync paths are invalid", {
          phase: "remote-state-sync-recovery",
          reason: "remote_state_pending_sync_path_invalid",
        }),
      );
}

async function validatePendingSyncMirrors(pending: PendingRemotePgliteSync): Promise<Result<void>> {
  const baseMirror = await validatePreservedMirrorRoot(pending.baseSnapshotRoot);
  if (baseMirror.isErr()) return err(baseMirror.error);
  return validatePreservedMirrorRoot(pending.uploadDataRoot);
}

async function validatePreservedMirrorRoot(root: string): Promise<Result<void>> {
  const requiredDirectories = [
    root,
    join(root, "pglite"),
    join(root, "source-links"),
    join(root, "server-applied-routes"),
  ];

  try {
    for (const path of requiredDirectories) {
      const metadata = await lstat(path);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("required directory is unavailable");
      }
    }
    const version = await lstat(join(root, "pglite", "PG_VERSION"));
    if (!version.isFile() || version.isSymbolicLink()) {
      throw new Error("PGlite version marker is unavailable");
    }
  } catch {
    return err(
      domainError.infra("Pending SSH remote PGlite state sync mirror is unavailable", {
        phase: "remote-state-sync-recovery",
        reason: "remote_state_pending_sync_mirror_unavailable",
      }),
    );
  }

  return ok(undefined);
}

async function detectOrphanedPendingSyncState(
  localDataRoot: string,
  readDirectory: (path: string) => Promise<string[]> = (path) => readdir(path),
): Promise<Result<boolean>> {
  const normalizedLocalRoot = resolve(localDataRoot);
  const siblingPrefix = `${basename(normalizedLocalRoot)}.`;
  const transactionPattern = /^(?:base|merged|recovery-merged)-\d+-\d+$/;
  try {
    const siblings = await readDirectory(dirname(normalizedLocalRoot));
    if (
      siblings.some(
        (name) =>
          name.startsWith(siblingPrefix) &&
          transactionPattern.test(name.slice(siblingPrefix.length)),
      )
    ) {
      return ok(true);
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return err(
        domainError.infra("SSH remote PGlite recovery state could not be inspected", {
          phase: "remote-state-sync-recovery",
          reason: "remote_state_orphan_scan_failed",
        }),
      );
    }
  }

  try {
    const recoveryEntries = await readDirectory(join(normalizedLocalRoot, "recovery"));
    return ok(recoveryEntries.some((name) => name.startsWith("pending-sync.json.tmp-")));
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT"
      ? ok(false)
      : err(
          domainError.infra("SSH remote PGlite recovery state could not be inspected", {
            phase: "remote-state-sync-recovery",
            reason: "remote_state_orphan_scan_failed",
          }),
        );
  }
}

async function writePendingSync(
  localDataRoot: string,
  input: Omit<PendingRemotePgliteSync, "schemaVersion" | "recordedAt">,
): Promise<void> {
  const path = pendingSyncPath(localDataRoot);
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(
    {
      schemaVersion: "remote-pglite-pending-sync/v1",
      ...input,
      recordedAt: new Date().toISOString(),
    } satisfies PendingRemotePgliteSync,
    null,
    2,
  )}\n`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serialized);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
  }
}

async function preparePrivateArchiveFile(path: string): Promise<void> {
  await rm(path, { force: true });
  const handle = await open(path, "w", 0o600);
  await handle.close();
}

async function replaceLocalMirror(input: {
  sourceRoot: string;
  targetRoot: string;
}): Promise<void> {
  const previousRoot = localTransactionRoot(input.targetRoot, "previous");

  await rm(previousRoot, { recursive: true, force: true });
  try {
    if (existsSync(input.targetRoot)) {
      await rename(input.targetRoot, previousRoot);
    }
    await rename(input.sourceRoot, input.targetRoot);
    await rm(previousRoot, { recursive: true, force: true });
  } catch (error) {
    await rm(input.sourceRoot, { recursive: true, force: true });
    if (!existsSync(input.targetRoot) && existsSync(previousRoot)) {
      await rename(previousRoot, input.targetRoot);
    }
    throw error;
  }
}

async function snapshotLocalMirror(input: {
  sourceRoot: string;
  snapshotRoot: string;
}): Promise<void> {
  await rm(input.snapshotRoot, { recursive: true, force: true });
  await mkdir(input.snapshotRoot, { recursive: true });

  for (const entry of ["pglite", "source-links", "server-applied-routes"] as const) {
    const sourcePath = join(input.sourceRoot, entry);
    const targetPath = join(input.snapshotRoot, entry);

    if (!existsSync(sourcePath)) {
      await mkdir(targetPath, { recursive: true });
      continue;
    }

    await cp(sourcePath, targetPath, { recursive: true });
  }
}

function lifecycleRunnerFromArchiveRunner(runner: RemotePgliteArchiveRunner): LifecycleRunner {
  const textDecoder = new TextDecoder();

  return {
    run(input: LifecycleRunnerInput): LifecycleRunnerResult {
      void input.cwd;
      void input.env;
      const result = runner.run({
        command: "ssh",
        args: [...buildSshRemoteStateProcessArgs(input.target), input.command],
        ...(input.redactions ? { redactions: input.redactions } : {}),
      });

      return {
        exitCode: result.exitCode,
        stdout: textDecoder.decode(result.stdout),
        stderr: result.stderr,
        failed: result.failed,
      };
    },
  };
}

export function resolveRemotePgliteStateSyncPlan(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  config: AppConfig = resolveConfig({ env }),
): Result<RemotePgliteStateSyncPlan | null> {
  if (!requiresRemotePgliteStateCommand(argv)) {
    return ok(null);
  }

  const stateBackend = readOption(argv, "--state-backend");
  if (stateBackend && explicitLocalStateBackends.has(stateBackend)) {
    return ok(null);
  }

  if (
    stateBackend !== "ssh-pglite" &&
    (env.APPALOFT_DATABASE_URL || env.APPALOFT_CONTROL_PLANE_URL)
  ) {
    return ok(null);
  }

  const target = sshTargetFromArgv(argv);
  if (target.isErr()) {
    return err(target.error);
  }
  if (!target.value) {
    if (stateBackend === "ssh-pglite") {
      return err(
        domainError.validation("SSH remote PGlite state requires --server-host", {
          phase: "remote-state-resolution",
          stateBackend: "ssh-pglite",
        }),
      );
    }

    return ok(null);
  }

  const remoteRuntimeRoot = readOption(argv, "--remote-runtime-root") ?? config.remoteRuntimeRoot;
  const dataRoot = `${remoteRuntimeRoot.replace(/\/+$/, "")}/state`;
  const localPgliteDataDir = resolve(
    env.APPALOFT_PGLITE_DATA_DIR ??
      join(config.dataDir, "remote-pglite", safeTargetKey(target.value, dataRoot), "pglite"),
  );
  const localDataRoot = dirname(localPgliteDataDir);

  return ok({
    dataRoot,
    localDataRoot,
    localPgliteDataDir,
    backupRetentionDays: config.remotePgliteSyncBackupRetentionDays,
    backupMaxCount: config.remotePgliteSyncBackupMaxCount,
    target: target.value,
    readOnly:
      hasSecretRotationPlanCommand(argv) ||
      hasServerCapacityInspectCommand(argv) ||
      (hasServerCapacityCommand(argv) && !hasExplicitDestructiveCapacityPrune(argv)),
  });
}

function shouldVerifyControlPlaneBackendMarker(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): boolean {
  if (!requiresRemotePgliteStateCommand(argv)) {
    return false;
  }

  const stateBackend = readOption(argv, "--state-backend");
  if (stateBackend === "postgres-control-plane") {
    return true;
  }

  if (stateBackend) {
    return false;
  }

  return Boolean(env.APPALOFT_DATABASE_URL || env.APPALOFT_CONTROL_PLANE_URL);
}

async function verifyControlPlaneRemoteStateBackend(input: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  config: AppConfig;
  runner?: RemotePgliteArchiveRunner;
}): Promise<Result<void>> {
  if (!shouldVerifyControlPlaneBackendMarker(input.argv, input.env)) {
    return ok(undefined);
  }

  const target = sshTargetFromArgv(input.argv);
  if (target.isErr()) {
    return err(target.error);
  }
  if (!target.value) {
    return ok(undefined);
  }

  const remoteRuntimeRoot =
    readOption(input.argv, "--remote-runtime-root") ?? input.config.remoteRuntimeRoot;
  const dataRoot = `${remoteRuntimeRoot.replace(/\/+$/, "")}/state`;
  const runner = input.runner ?? defaultRunner();
  const remoteMarker = runner.run({
    command: "ssh",
    args: [
      ...buildSshRemoteStateProcessArgs(target.value),
      remoteControlPlaneBackendMarkerEnsureCommand(dataRoot),
    ],
    redactions: target.value.identityFile ? [target.value.identityFile] : [],
  });

  if (remoteMarker.failed) {
    return err(
      domainError.infra(
        "SSH remote state backend marker could not be read",
        errorDetails({
          phase: "server-state-backend",
          target: target.value,
          exitCode: remoteMarker.exitCode,
          stderr: remoteMarker.stderr,
        }),
      ),
    );
  }

  const markerText = new TextDecoder().decode(remoteMarker.stdout);
  const marker = parseServerStateBackendMarker(markerText);
  if (!marker && markerText.trim()) {
    return err(
      serverStateBackendMismatchError({
        expectedStateBackend: "postgres-control-plane",
        actualStateBackend: "unknown",
        phase: "server-state-backend",
        host: target.value.host,
        port: target.value.port ?? 22,
        dataRoot,
      }),
    );
  }

  if (marker && marker.stateBackend !== "postgres-control-plane") {
    return err(
      serverStateBackendMismatchError({
        expectedStateBackend: "postgres-control-plane",
        actualStateBackend: marker.stateBackend,
        phase: "server-state-backend",
        host: target.value.host,
        port: target.value.port ?? 22,
        dataRoot,
      }),
    );
  }

  return ok(undefined);
}

export class RemotePgliteArchiveSync {
  private readonly runner: RemotePgliteArchiveRunner;

  constructor(
    private readonly plan: RemotePgliteStateSyncPlan,
    runner?: RemotePgliteArchiveRunner,
  ) {
    this.runner = runner ?? defaultRunner();
  }

  async syncFromRemote(): Promise<Result<void>> {
    const stagingRoot = localTransactionRoot(this.plan.localDataRoot, "download");
    const archivePath = `${stagingRoot}.tar.gz`;
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(dirname(this.plan.localDataRoot), { recursive: true });
    await preparePrivateArchiveFile(archivePath);

    try {
      const downloadInput = {
        command: "ssh",
        args: [
          ...buildSshRemoteStateProcessArgs(this.plan.target),
          remoteArchiveCommand(this.plan.dataRoot, this.plan.readOnly === true),
        ],
        redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
      } satisfies RemotePgliteArchiveRunnerInput;
      const remoteArchive = this.runner.runToFile
        ? await this.runner.runToFile(downloadInput, archivePath)
        : this.runner.run(downloadInput);
      if (remoteArchive.failed) {
        return err(
          domainError.infra(
            "SSH remote PGlite state could not be downloaded",
            errorDetails({
              phase: "remote-state-sync-download",
              target: this.plan.target,
              exitCode: remoteArchive.exitCode,
              stderr: remoteArchive.stderr,
            }),
          ),
        );
      }
      if (!this.runner.runToFile) {
        await writeFile(archivePath, remoteArchive.stdout, { mode: 0o600 });
      }

      await mkdir(stagingRoot, { recursive: true });
      const extract = this.runner.run({
        command: "tar",
        args: ["-xzf", archivePath, "-C", stagingRoot],
      });
      if (extract.failed) {
        await rm(stagingRoot, { recursive: true, force: true });
        return err(
          domainError.infra(
            "SSH remote PGlite state archive could not be extracted",
            errorDetails({
              phase: "remote-state-sync-download",
              target: this.plan.target,
              exitCode: extract.exitCode,
              stderr: extract.stderr,
            }),
          ),
        );
      }

      await replaceLocalMirror({
        sourceRoot: stagingRoot,
        targetRoot: this.plan.localDataRoot,
      });
      return ok(undefined);
    } catch (error) {
      return err(
        domainError.infra("SSH remote PGlite local mirror could not be replaced", {
          ...errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
          }),
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      await rm(archivePath, { force: true });
    }
  }

  async readRemoteRevision(): Promise<Result<number>> {
    const remoteRevision = this.runner.run({
      command: "ssh",
      args: [
        ...buildSshRemoteStateProcessArgs(this.plan.target),
        remoteRevisionReadCommand(this.plan.dataRoot, this.plan.readOnly === true),
      ],
      redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
    });
    if (remoteRevision.failed) {
      return err(
        domainError.infra(
          "SSH remote PGlite state revision could not be read",
          errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
            exitCode: remoteRevision.exitCode,
            stderr: remoteRevision.stderr,
          }),
        ),
      );
    }

    const parsedRevision = parseRemoteRevision(new TextDecoder().decode(remoteRevision.stdout));
    if (parsedRevision === null) {
      return err(
        domainError.infra("SSH remote PGlite state revision is invalid", {
          ...errorDetails({
            phase: "remote-state-sync-download",
            target: this.plan.target,
          }),
          revision: new TextDecoder().decode(remoteRevision.stdout).trim().slice(0, 128),
        }),
      );
    }

    return ok(parsedRevision);
  }

  async syncToRemote(input?: {
    expectedRevision: number;
    nextRevision: number;
    requireExistingMirror?: boolean;
  }): Promise<Result<void>> {
    const expectedRevision = input?.expectedRevision ?? 0;
    const nextRevision = input?.nextRevision ?? expectedRevision + 1;
    if (input?.requireExistingMirror) {
      const validMirror = await validatePreservedMirrorRoot(this.plan.localDataRoot);
      if (validMirror.isErr()) return err(validMirror.error);
    } else {
      await mkdir(this.plan.localPgliteDataDir, { recursive: true });
      await mkdir(join(this.plan.localDataRoot, "source-links"), { recursive: true });
      await mkdir(join(this.plan.localDataRoot, "server-applied-routes"), { recursive: true });
    }
    const archivePath = `${localTransactionRoot(this.plan.localDataRoot, "upload")}.tar.gz`;
    await preparePrivateArchiveFile(archivePath);
    try {
      const archive = this.runner.run({
        command: "tar",
        args: [
          "-czf",
          archivePath,
          "-C",
          this.plan.localDataRoot,
          "pglite",
          "source-links",
          "server-applied-routes",
        ],
      });
      if (archive.failed) {
        return err(
          domainError.infra(
            "Local PGlite state archive could not be created",
            errorDetails({
              phase: "remote-state-sync-upload",
              target: this.plan.target,
              exitCode: archive.exitCode,
              stderr: archive.stderr,
            }),
          ),
        );
      }

      const uploadInput = {
        command: "ssh",
        args: [
          ...buildSshRemoteStateProcessArgs(this.plan.target),
          remoteExtractCommand({
            dataRoot: this.plan.dataRoot,
            expectedRevision,
            nextRevision,
            backupRetentionDays: this.plan.backupRetentionDays,
            backupMaxCount: this.plan.backupMaxCount,
          }),
        ],
        redactions: this.plan.target.identityFile ? [this.plan.target.identityFile] : [],
      } satisfies RemotePgliteArchiveRunnerInput;
      const remoteExtract = this.runner.runFromFile
        ? await this.runner.runFromFile(uploadInput, archivePath)
        : this.runner.run({ ...uploadInput, stdin: await readFile(archivePath) });
      if (remoteExtract.failed) {
        const revisionConflict =
          remoteExtract.exitCode === remoteStateRevisionConflictExitCode
            ? parseRemoteRevisionConflict(remoteExtract.stderr)
            : null;
        return err(
          remoteExtract.exitCode === remoteStateRevisionConflictExitCode
            ? {
                code: "infra_error",
                category: "infra",
                message:
                  "SSH remote PGlite state changed while the command was running; retry with a fresh remote snapshot",
                retryable: true,
                details: {
                  ...errorDetails({
                    phase: "remote-state-sync-upload",
                    target: this.plan.target,
                    exitCode: remoteExtract.exitCode,
                    stderr: remoteExtract.stderr,
                  }),
                  reason: "remote_state_revision_conflict",
                  ...(revisionConflict?.expectedRevision === undefined
                    ? {}
                    : { expectedRevision: revisionConflict.expectedRevision }),
                  ...(revisionConflict?.actualRevision === undefined
                    ? {}
                    : { actualRevision: revisionConflict.actualRevision }),
                },
              }
            : domainError.infra(
                "SSH remote PGlite state could not be uploaded",
                errorDetails({
                  phase: "remote-state-sync-upload",
                  target: this.plan.target,
                  exitCode: remoteExtract.exitCode,
                  stderr: remoteExtract.stderr,
                }),
              ),
        );
      }

      return ok(undefined);
    } finally {
      await rm(archivePath, { force: true });
    }
  }
}

export async function prepareRemotePgliteStateSync(
  input: PrepareRemotePgliteStateSyncInput,
): Promise<Result<RemotePgliteStateSyncSession | null>> {
  const env = input.env ?? process.env;
  const config = input.config ?? resolveConfig({ env });
  const controlPlaneBackend = await verifyControlPlaneRemoteStateBackend({
    argv: input.argv,
    env,
    config,
    ...(input.runner ? { runner: input.runner } : {}),
  });
  if (controlPlaneBackend.isErr()) {
    return err(controlPlaneBackend.error);
  }

  const plan = resolveRemotePgliteStateSyncPlan(input.argv, env, config);
  if (plan.isErr()) {
    return err(plan.error);
  }
  if (!plan.value) {
    return ok(null);
  }
  const planValue = plan.value;

  const lifecycleRunner = input.runner ? lifecycleRunnerFromArchiveRunner(input.runner) : undefined;
  const pendingPath = pendingSyncPath(planValue.localDataRoot);
  const retryPendingSync = hasPendingSyncRetryOption(input.argv);
  if (retryPendingSync && !hasServerCapacityInspectCommand(input.argv)) {
    return err(
      domainError.validation(
        "Pending SSH remote PGlite state sync recovery is only available through server capacity inspect",
        {
          phase: "remote-state-sync-recovery",
          reason: "remote_state_pending_sync_inspect_required",
        },
      ),
    );
  }
  if (!existsSync(pendingPath)) {
    const orphaned = await detectOrphanedPendingSyncState(
      planValue.localDataRoot,
      input.readDirectory,
    );
    if (orphaned.isErr()) return err(orphaned.error);
    if (orphaned.value) {
      return err(
        domainError.infra(
          "Orphaned SSH remote PGlite recovery state must be inspected before downloading",
          {
            ...errorDetails({
              phase: "remote-state-sync-recovery",
              target: planValue.target,
            }),
            reason: "remote_state_orphaned_pending_sync",
          },
        ),
      );
    }
  }
  if (existsSync(pendingPath)) {
    const pending = await readPendingSync(planValue.localDataRoot);
    if (!pending) {
      return err(
        domainError.infra("Pending SSH remote PGlite state sync metadata is invalid", {
          ...errorDetails({
            phase: "remote-state-sync-recovery",
            target: planValue.target,
          }),
          reason: "remote_state_pending_sync_invalid",
        }),
      );
    }
    const validPendingPaths = validatePendingSyncPaths(planValue.localDataRoot, pending);
    if (validPendingPaths.isErr()) {
      return err(validPendingPaths.error);
    }
    if (
      pending.targetFingerprint !== remoteTargetFingerprint(planValue.target, planValue.dataRoot)
    ) {
      return err(
        domainError.infra(
          "Pending SSH remote PGlite state sync belongs to a different remote target",
          {
            ...errorDetails({
              phase: "remote-state-sync-recovery",
              target: planValue.target,
            }),
            reason: "remote_state_pending_sync_target_mismatch",
          },
        ),
      );
    }
    if (!retryPendingSync) {
      return err(
        domainError.infra(
          "A previous SSH remote PGlite upload is pending; retry it before downloading remote state",
          {
            ...errorDetails({
              phase: "remote-state-sync-recovery",
              target: planValue.target,
            }),
            reason: "remote_state_pending_sync_required",
            expectedRevision: pending.expectedRevision,
          },
        ),
      );
    }
    const validPendingMirrors = await validatePendingSyncMirrors(pending);
    if (validPendingMirrors.isErr()) {
      return err(validPendingMirrors.error);
    }

    const recoveryLifecycle = await new SshRemoteStateLifecycle({
      target: planValue.target,
      dataRoot: planValue.dataRoot,
      owner: "appaloft-cli-pending-sync-recovery",
      correlationId: `remote_state_recovery_${process.pid}_${Date.now().toString(36)}`,
      staleAfterMs: remotePgliteMaintenanceLockStaleAfterMs,
      ...(lifecycleRunner ? { runner: lifecycleRunner } : {}),
    }).prepare();
    if (recoveryLifecycle.isErr()) {
      return err(recoveryLifecycle.error);
    }
    let activePending = pending;
    let recovered: Result<void>;
    try {
      recovered = await new RemotePgliteArchiveSync(
        {
          ...planValue,
          localDataRoot: activePending.uploadDataRoot,
          localPgliteDataDir: join(activePending.uploadDataRoot, "pglite"),
        },
        input.runner,
      ).syncToRemote({
        expectedRevision: activePending.expectedRevision,
        nextRevision: activePending.nextRevision,
        requireExistingMirror: true,
      });
    } catch {
      recovered = err(
        domainError.infra("Pending SSH remote PGlite recovery upload was interrupted", {
          ...errorDetails({
            phase: "remote-state-sync-recovery",
            target: planValue.target,
          }),
          reason: "remote_state_pending_sync_upload_interrupted",
        }),
      );
    }
    if (recovered.isErr() && recovered.error.details?.reason === "remote_state_revision_conflict") {
      try {
        const recoveryMergedRoot = localTransactionRoot(planValue.localDataRoot, "recovery-merged");
        const recoveryMergedSync = new RemotePgliteArchiveSync(
          {
            ...planValue,
            readOnly: false,
            localDataRoot: recoveryMergedRoot,
            localPgliteDataDir: join(recoveryMergedRoot, "pglite"),
          },
          input.runner,
        );
        const refreshedRemote = await recoveryMergedSync.syncFromRemote();
        if (refreshedRemote.isErr()) {
          recovered = err(refreshedRemote.error);
        } else {
          const refreshedRevision = await recoveryMergedSync.readRemoteRevision();
          if (refreshedRevision.isErr()) {
            recovered = err(refreshedRevision.error);
          } else {
            const merged = await mergeRemotePgliteState({
              baseDataRoot: activePending.baseSnapshotRoot,
              localDataRoot: activePending.uploadDataRoot,
              targetDataRoot: recoveryMergedRoot,
              ...(input.pgliteRuntimeAssets
                ? { pgliteRuntimeAssets: input.pgliteRuntimeAssets }
                : {}),
            });
            if (merged.isErr()) {
              recovered = err(merged.error);
            } else {
              const previousUploadRoot = activePending.uploadDataRoot;
              activePending = {
                ...activePending,
                expectedRevision: refreshedRevision.value,
                nextRevision: refreshedRevision.value + 1,
                uploadDataRoot: recoveryMergedRoot,
                recordedAt: new Date().toISOString(),
              };
              let markerCommitted = false;
              try {
                await writePendingSync(planValue.localDataRoot, activePending);
                markerCommitted = true;
              } catch {
                await rm(recoveryMergedRoot, { recursive: true, force: true });
                recovered = err(
                  domainError.infra(
                    "Pending SSH remote PGlite recovery marker could not be saved",
                    {
                      ...errorDetails({
                        phase: "remote-state-sync-recovery",
                        target: planValue.target,
                      }),
                      reason: "remote_state_pending_sync_marker_write_failed",
                    },
                  ),
                );
              }
              if (markerCommitted) {
                try {
                  if (
                    previousUploadRoot !== planValue.localDataRoot &&
                    previousUploadRoot !== recoveryMergedRoot
                  ) {
                    await rm(previousUploadRoot, { recursive: true, force: true });
                  }
                  recovered = await recoveryMergedSync.syncToRemote({
                    expectedRevision: activePending.expectedRevision,
                    nextRevision: activePending.nextRevision,
                    requireExistingMirror: true,
                  });
                } catch {
                  recovered = err(
                    domainError.infra("Pending SSH remote PGlite recovery upload was interrupted", {
                      ...errorDetails({
                        phase: "remote-state-sync-recovery",
                        target: planValue.target,
                      }),
                      reason: "remote_state_pending_sync_upload_interrupted",
                    }),
                  );
                }
              }
            }
          }
        }
      } catch {
        recovered = err(
          domainError.infra("Pending SSH remote PGlite recovery was interrupted", {
            ...errorDetails({
              phase: "remote-state-sync-recovery",
              target: planValue.target,
            }),
            reason: "remote_state_pending_sync_recovery_interrupted",
          }),
        );
      }
    }
    const recoveryReleased = await recoveryLifecycle.value.release();
    if (recovered.isErr()) {
      return err(recovered.error);
    }
    if (recoveryReleased.isErr()) {
      return err(recoveryReleased.error);
    }
    await rm(pendingPath, { force: true });
    await rm(activePending.baseSnapshotRoot, { recursive: true, force: true });
    if (activePending.uploadDataRoot !== planValue.localDataRoot) {
      await rm(activePending.uploadDataRoot, { recursive: true, force: true });
    }
  }

  const lifecycle = new SshRemoteStateLifecycle({
    target: planValue.target,
    dataRoot: planValue.dataRoot,
    readOnly: planValue.readOnly === true,
    owner: "appaloft-cli",
    correlationId: `remote_state_shell_${process.pid}_${Date.now().toString(36)}`,
    staleAfterMs: remotePgliteMaintenanceLockStaleAfterMs,
    ...(lifecycleRunner ? { runner: lifecycleRunner } : {}),
  });
  const prepared = await lifecycle.prepare();
  if (prepared.isErr()) {
    return err(prepared.error);
  }

  const archiveSync = new RemotePgliteArchiveSync(planValue, input.runner);
  const downloaded = await archiveSync.syncFromRemote();
  if (downloaded.isErr()) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(downloaded.error);
  }

  if (planValue.readOnly === true) {
    const compatible = await verifyReadOnlyPgliteMajorVersion(planValue);
    if (compatible.isErr()) {
      const released = await prepared.value.release();
      if (released.isErr()) {
        return err(released.error);
      }
      return err(compatible.error);
    }
  }

  const baseRevision = await archiveSync.readRemoteRevision();
  if (baseRevision.isErr()) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(baseRevision.error);
  }

  let activeLifecycleSession = prepared.value;
  let activeBaseRevision = baseRevision.value;
  let releasedForCliRuntime = false;
  const baseSnapshotRoot = localTransactionRoot(planValue.localDataRoot, "base");

  try {
    await snapshotLocalMirror({
      sourceRoot: planValue.localDataRoot,
      snapshotRoot: baseSnapshotRoot,
    });
  } catch (error) {
    const released = await prepared.value.release();
    if (released.isErr()) {
      return err(released.error);
    }
    return err(
      domainError.infra("SSH remote PGlite base snapshot could not be prepared", {
        ...errorDetails({
          phase: "remote-state-sync-download",
          target: planValue.target,
        }),
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  async function ensureReleased(): Promise<Result<void>> {
    if (releasedForCliRuntime) {
      return ok(undefined);
    }

    const released = await activeLifecycleSession.release();
    if (released.isErr()) {
      return err(released.error);
    }

    releasedForCliRuntime = true;
    return ok(undefined);
  }

  async function ensureLifecycleSession(): Promise<Result<void>> {
    if (!releasedForCliRuntime) {
      return ok(undefined);
    }

    const resumed = await new SshRemoteStateLifecycle({
      target: planValue.target,
      dataRoot: planValue.dataRoot,
      owner: "appaloft-cli",
      correlationId: `remote_state_shell_resume_${process.pid}_${Date.now().toString(36)}`,
      staleAfterMs: remotePgliteMaintenanceLockStaleAfterMs,
      ...(lifecycleRunner ? { runner: lifecycleRunner } : {}),
    }).prepare();
    if (resumed.isErr()) {
      return err(resumed.error);
    }

    activeLifecycleSession = resumed.value;
    releasedForCliRuntime = false;
    return ok(undefined);
  }

  return ok({
    ...planValue,
    releaseForCliRuntime: async () => ensureReleased(),
    refreshLocalMirror: async () => {
      const resumed = await ensureLifecycleSession();
      if (resumed.isErr()) {
        return err(resumed.error);
      }

      const downloaded = await archiveSync.syncFromRemote();
      if (downloaded.isErr()) {
        const released = await activeLifecycleSession.release();
        if (released.isErr()) {
          return err(released.error);
        }
        releasedForCliRuntime = true;
        return err(downloaded.error);
      }

      const refreshedRevision = await archiveSync.readRemoteRevision();
      if (refreshedRevision.isErr()) {
        const released = await activeLifecycleSession.release();
        if (released.isErr()) {
          return err(released.error);
        }
        releasedForCliRuntime = true;
        return err(refreshedRevision.error);
      }

      activeBaseRevision = refreshedRevision.value;
      try {
        await snapshotLocalMirror({
          sourceRoot: planValue.localDataRoot,
          snapshotRoot: baseSnapshotRoot,
        });
      } catch (error) {
        const released = await activeLifecycleSession.release();
        if (released.isErr()) {
          return err(released.error);
        }
        releasedForCliRuntime = true;
        return err(
          domainError.infra("SSH remote PGlite base snapshot could not be refreshed", {
            ...errorDetails({
              phase: "remote-state-sync-download",
              target: planValue.target,
            }),
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }

      const released = await ensureReleased();
      if (released.isErr()) {
        return err(released.error);
      }

      return ok(undefined);
    },
    discardAndRelease: async () => {
      const released = await ensureReleased();
      await rm(baseSnapshotRoot, { recursive: true, force: true });
      return released;
    },
    syncBackAndRelease: async () => {
      let firstError: DomainError | null = null;
      const mergedLocalRoot = localTransactionRoot(planValue.localDataRoot, "merged");
      let pendingUploadRoot = planValue.localDataRoot;
      let pendingExpectedRevision = activeBaseRevision;
      if (planValue.readOnly) {
        const released = await ensureReleased();
        await rm(baseSnapshotRoot, { recursive: true, force: true });
        await rm(mergedLocalRoot, { recursive: true, force: true });
        return released;
      }
      const resumed = await ensureLifecycleSession();
      if (resumed.isErr()) {
        return err(resumed.error);
      }

      const guardedUpload = async (
        sync: RemotePgliteArchiveSync,
        expectedRevision: number,
        nextRevision: number,
      ): Promise<Result<void>> => {
        try {
          return await sync.syncToRemote({ expectedRevision, nextRevision });
        } catch {
          return err(
            domainError.infra("SSH remote PGlite state upload was interrupted", {
              ...errorDetails({
                phase: "remote-state-sync-upload",
                target: planValue.target,
              }),
              reason: "remote_state_sync_upload_interrupted",
            }),
          );
        }
      };

      let uploaded = await guardedUpload(archiveSync, activeBaseRevision, activeBaseRevision + 1);
      if (uploaded.isErr() && uploaded.error.details?.reason === "remote_state_revision_conflict") {
        try {
          const mergedArchiveSync = new RemotePgliteArchiveSync(
            {
              ...planValue,
              localDataRoot: mergedLocalRoot,
              localPgliteDataDir: join(mergedLocalRoot, "pglite"),
            },
            input.runner,
          );
          const refreshedRemote = await mergedArchiveSync.syncFromRemote();
          if (refreshedRemote.isErr()) {
            firstError = refreshedRemote.error;
          } else {
            const refreshedRevision = await mergedArchiveSync.readRemoteRevision();
            if (refreshedRevision.isErr()) {
              firstError = refreshedRevision.error;
            } else {
              const merged = await mergeRemotePgliteState({
                baseDataRoot: baseSnapshotRoot,
                localDataRoot: planValue.localDataRoot,
                targetDataRoot: mergedLocalRoot,
                ...(input.pgliteRuntimeAssets
                  ? { pgliteRuntimeAssets: input.pgliteRuntimeAssets }
                  : {}),
              });
              if (merged.isErr()) {
                firstError = merged.error;
              } else {
                pendingUploadRoot = mergedLocalRoot;
                pendingExpectedRevision = refreshedRevision.value;
                uploaded = await guardedUpload(
                  mergedArchiveSync,
                  refreshedRevision.value,
                  refreshedRevision.value + 1,
                );
                if (uploaded.isErr()) {
                  firstError = uploaded.error;
                } else {
                  activeBaseRevision = refreshedRevision.value + 1;
                }
              }
            }
          }
        } catch {
          firstError = domainError.infra("SSH remote PGlite conflict recovery was interrupted", {
            ...errorDetails({
              phase: "remote-state-sync-recovery",
              target: planValue.target,
            }),
            reason: "remote_state_sync_conflict_recovery_interrupted",
          });
        }
      } else if (uploaded.isErr()) {
        firstError = uploaded.error;
      } else {
        activeBaseRevision += 1;
      }

      let pendingPersistenceError: DomainError | null = null;
      if (firstError) {
        try {
          await writePendingSync(planValue.localDataRoot, {
            targetFingerprint: remoteTargetFingerprint(planValue.target, planValue.dataRoot),
            expectedRevision: pendingExpectedRevision,
            nextRevision: pendingExpectedRevision + 1,
            baseSnapshotRoot,
            uploadDataRoot: pendingUploadRoot,
          });
        } catch {
          pendingPersistenceError = domainError.infra(
            "Pending SSH remote PGlite recovery marker could not be saved",
            {
              ...errorDetails({
                phase: "remote-state-sync-recovery",
                target: planValue.target,
              }),
              reason: "remote_state_pending_sync_marker_write_failed",
            },
          );
        }
      }

      let released: Result<void>;
      try {
        released = await activeLifecycleSession.release();
      } catch {
        released = err(
          domainError.infra("SSH remote PGlite mutation lock release was interrupted", {
            ...errorDetails({
              phase: "remote-state-sync-release",
              target: planValue.target,
            }),
            reason: "remote_state_sync_release_interrupted",
          }),
        );
      }
      releasedForCliRuntime = released.isOk();
      if (pendingPersistenceError) {
        return err(pendingPersistenceError);
      }
      if (firstError) {
        return err({
          ...firstError,
          details: {
            ...(firstError.details ?? {}),
            recoveryPhase: "remote-state-sync-recovery",
            recoveryAction: "run-capacity-inspect-with---retry-pending-state-sync",
          },
        });
      }
      try {
        await rm(mergedLocalRoot, { recursive: true, force: true });
        await rm(baseSnapshotRoot, { recursive: true, force: true });
        await rm(pendingSyncPath(planValue.localDataRoot), { force: true });
      } catch {
        return err(
          domainError.infra("Completed SSH remote PGlite transaction could not be cleaned up", {
            ...errorDetails({
              phase: "remote-state-sync-cleanup",
              target: planValue.target,
            }),
            reason: "remote_state_completed_sync_cleanup_failed",
            ...(released.isErr() && typeof released.error.details?.reason === "string"
              ? { releaseReason: released.error.details.reason }
              : {}),
          }),
        );
      }

      return released;
    },
  });
}
