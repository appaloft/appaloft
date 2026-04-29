import { domainError, err, ok, type Result } from "@appaloft/core";
import { resolvePublicDocsErrorKnowledge } from "@appaloft/docs-registry";
import { type RemoteStateSession } from "./deployment-remote-state.js";
import {
  type DeploymentStateBackendDecision,
  type TrustedSshTargetInput,
} from "./deployment-state.js";

export interface SshRemoteStateTarget {
  host: string;
  port?: number;
  username?: string;
  identityFile?: string;
}

export interface SshRemoteCommandInput {
  target: SshRemoteStateTarget;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}

export interface SshRemoteCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
}

export interface SshRemoteCommandRunner {
  run(input: SshRemoteCommandInput): Promise<SshRemoteCommandResult> | SshRemoteCommandResult;
}

export interface SshRemoteStateLifecycleOptions {
  dataRoot: string;
  target: SshRemoteStateTarget;
  schemaVersion?: number;
  owner?: string;
  correlationId?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: SshRemoteCommandRunner;
  heartbeatIntervalMs?: number | null;
  staleAfterMs?: number;
  lockAcquireTimeoutMs?: number;
  lockRetryIntervalMs?: number;
}

const defaultSchemaVersion = 1;
const defaultLockHeartbeatIntervalMs = 30_000;
const defaultLockStaleAfterMs = 20 * 60_000;
const defaultLockAcquireTimeoutMs = 3 * 60_000;
const defaultLockRetryIntervalMs = 1_000;
const lockConflictExitCode = 73;
const migrationFailureExitCode = 74;
const lockOwnershipExitCode = 75;

interface RemoteStateLockMetadata {
  owner?: string;
  correlationId?: string;
  startedAt?: string;
  lastHeartbeatAt?: string;
  staleAfterSeconds?: number;
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

function safeOutput(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue.slice(0, 2_000) : undefined;
}

function defaultCorrelationId(prefix: string): string {
  return `${prefix}_${process.pid}_${Date.now().toString(36)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLockMetadata(stderr: string): RemoteStateLockMetadata | null {
  const trimmedValue = stderr.trim();
  if (!trimmedValue.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedValue) as RemoteStateLockMetadata;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function targetHost(target: SshRemoteStateTarget): string {
  const host = target.host.trim();
  const username = trimmed(target.username);
  return username ? `${username}@${host}` : host;
}

function normalizePort(port: number | undefined): string {
  return String(port ?? 22);
}

export function buildSshRemoteStateProcessArgs(target: SshRemoteStateTarget): string[] {
  return [
    "-p",
    normalizePort(target.port),
    ...(target.identityFile ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"] : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    targetHost(target),
  ];
}

class BunSshRemoteCommandRunner implements SshRemoteCommandRunner {
  run(input: SshRemoteCommandInput): SshRemoteCommandResult {
    const result = Bun.spawnSync(
      ["ssh", ...buildSshRemoteStateProcessArgs(input.target), input.command],
      {
        cwd: input.cwd,
        env: input.env,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    return {
      exitCode: result.exitCode,
      stdout: redactSecrets(result.stdout.toString(), input.redactions),
      stderr: redactSecrets(result.stderr.toString(), input.redactions),
      failed: !result.success,
    };
  }
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function remotePrepareCommand(input: {
  dataRoot: string;
  schemaVersion: number;
  owner: string;
  correlationId: string;
  staleAfterSeconds: number;
}): string {
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `schema_version=${shellQuote(String(input.schemaVersion))}`,
    `stale_after_seconds=${shellQuote(String(input.staleAfterSeconds))}`,
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'now_epoch="$(date -u +%s)"',
    'stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"',
    'mkdir -p "$data_root"',
    'mkdir -p "$data_root/pglite" "$data_root/locks" "$data_root/backups" "$data_root/journals" "$data_root/source-links" "$data_root/server-applied-routes" "$data_root/locks/recovered"',
    'lock_dir="$data_root/locks/mutation.lock"',
    'owner_file="$lock_dir/owner.json"',
    'if ! mkdir "$lock_dir"; then',
    '  last_heartbeat=""',
    '  recorded_stale_after=""',
    '  lock_age_seconds=""',
    '  if [ -f "$owner_file" ]; then',
    '    last_heartbeat="$(sed -n \'s/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '    if [ -z "$last_heartbeat" ]; then',
    '      last_heartbeat="$(sed -n \'s/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    "    fi",
    '    recorded_stale_after="$(sed -n \'s/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    "  fi",
    '  [ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"',
    '  if [ -n "$last_heartbeat" ]; then',
    '    heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"',
    "  else",
    '    heartbeat_epoch=""',
    "  fi",
    '  if [ -z "$heartbeat_epoch" ]; then',
    '    heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"',
    "  fi",
    '  if [ -n "$heartbeat_epoch" ]; then',
    "    lock_age_seconds=$((now_epoch - heartbeat_epoch))",
    "  fi",
    '  if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then',
    '    recovered_path="$data_root/locks/recovered/mutation-$stamp-$$.lock"',
    '    if mv "$lock_dir" "$recovered_path" 2>/dev/null; then',
    `      printf '{"phase":"%s","recoveredAt":"%s","recoveredBy":%s,"correlationId":%s,"lockAgeSeconds":%s}\n' "remote-state-lock" "$now" ${shellQuote(jsonString(input.owner))} ${shellQuote(jsonString(input.correlationId))} "$lock_age_seconds" > "$recovered_path/recovered.json"`,
    '      mkdir "$lock_dir"',
    "    else",
    '      if [ -f "$owner_file" ]; then cat "$owner_file" >&2; fi',
    `      exit ${lockConflictExitCode}`,
    "    fi",
    "  else",
    '    if [ -f "$owner_file" ]; then cat "$owner_file" >&2; fi',
    `    exit ${lockConflictExitCode}`,
    "  fi",
    "fi",
    `printf '{"owner":%s,"correlationId":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":%s}\n' ${shellQuote(jsonString(input.owner))} ${shellQuote(jsonString(input.correlationId))} "$now" "$now" "$stale_after_seconds" > "$owner_file"`,
    'marker="$data_root/schema-version.json"',
    "current_version=0",
    'if [ -f "$marker" ]; then',
    '  current_version="$(sed -n \'s/.*"version"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$marker" | head -n 1 || true)"',
    "fi",
    '[ -n "$current_version" ] || current_version=0',
    'if [ "$current_version" != "$schema_version" ]; then',
    '  backup_path="$data_root/backups/schema-$current_version-to-$schema_version-$stamp.json"',
    '  journal_path="$data_root/journals/schema-$current_version-to-$schema_version-$stamp.json"',
    '  if [ -f "$marker" ]; then cp "$marker" "$backup_path"; else printf "{}\\n" > "$backup_path"; fi',
    '  printf \'{"phase":"remote-state-migration","fromVersion":%s,"toVersion":%s,"startedAt":"%s"}\\n\' "$current_version" "$schema_version" "$now" > "$journal_path"',
    '  printf \'{"version":%s,"migratedAt":"%s"}\\n\' "$schema_version" "$now" > "$marker"',
    "fi",
    'actual_version="$(sed -n \'s/.*"version"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$marker" | head -n 1 || true)"',
    'if [ "$actual_version" != "$schema_version" ]; then',
    '  printf \'{"phase":"remote-state-recovery","message":"schema marker integrity check failed","recordedAt":"%s"}\\n\' "$now" > "$data_root/recovery.json"',
    '  rm -rf "$lock_dir"',
    '  echo "remote state schema marker failed integrity check" >&2',
    `  exit ${migrationFailureExitCode}`,
    "fi",
    'printf "prepared %s schema=%s\\n" "$data_root" "$schema_version"',
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

function remoteHeartbeatCommand(input: {
  dataRoot: string;
  owner: string;
  correlationId: string;
  staleAfterSeconds: number;
}): string {
  const expectedOwnerFragment = `"owner":${jsonString(input.owner)}`;
  const expectedCorrelationFragment = `"correlationId":${jsonString(input.correlationId)}`;
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `stale_after_seconds=${shellQuote(String(input.staleAfterSeconds))}`,
    `expected_owner_fragment=${shellQuote(expectedOwnerFragment)}`,
    `expected_correlation_fragment=${shellQuote(expectedCorrelationFragment)}`,
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'lock_dir="$data_root/locks/mutation.lock"',
    'owner_file="$lock_dir/owner.json"',
    '[ -d "$lock_dir" ] || exit 0',
    '[ -f "$owner_file" ] || exit 0',
    'grep -F "$expected_owner_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'grep -F "$expected_correlation_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'started_at="$(sed -n \'s/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '[ -n "$started_at" ] || started_at="$now"',
    `printf '{"owner":%s,"correlationId":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":%s}\n' ${shellQuote(jsonString(input.owner))} ${shellQuote(jsonString(input.correlationId))} "$started_at" "$now" "$stale_after_seconds" > "$owner_file"`,
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

function remoteReleaseCommand(input: {
  dataRoot: string;
  owner: string;
  correlationId: string;
}): string {
  const expectedOwnerFragment = `"owner":${jsonString(input.owner)}`;
  const expectedCorrelationFragment = `"correlationId":${jsonString(input.correlationId)}`;
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `expected_owner_fragment=${shellQuote(expectedOwnerFragment)}`,
    `expected_correlation_fragment=${shellQuote(expectedCorrelationFragment)}`,
    'lock_dir="$data_root/locks/mutation.lock"',
    'owner_file="$lock_dir/owner.json"',
    '[ -d "$lock_dir" ] || exit 0',
    '[ -f "$owner_file" ] || { rm -rf "$lock_dir"; exit 0; }',
    'grep -F "$expected_owner_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'grep -F "$expected_correlation_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'rm -rf "$data_root/locks/mutation.lock"',
    'printf "released %s\\n" "$data_root"',
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

function phaseForPrepareFailure(result: SshRemoteCommandResult): string {
  if (result.exitCode === lockConflictExitCode) {
    return "remote-state-lock";
  }

  if (result.exitCode === migrationFailureExitCode) {
    return "remote-state-migration";
  }

  return "remote-state-resolution";
}

function errorDetails(input: {
  target: SshRemoteStateTarget;
  phase: string;
  exitCode: number;
  stderr: string;
  reason?: string;
}): Record<string, string | number | boolean | null> {
  const lockMetadata = input.phase === "remote-state-lock" ? parseLockMetadata(input.stderr) : null;
  return {
    phase: input.phase,
    stateBackend: "ssh-pglite",
    host: input.target.host,
    port: normalizePort(input.target.port),
    exitCode: input.exitCode,
    ...(lockMetadata?.owner ? { lockOwner: lockMetadata.owner } : {}),
    ...(lockMetadata?.correlationId ? { correlationId: lockMetadata.correlationId } : {}),
    ...(lockMetadata?.startedAt ? { lockStartedAt: lockMetadata.startedAt } : {}),
    ...(lockMetadata?.lastHeartbeatAt ? { lockHeartbeatAt: lockMetadata.lastHeartbeatAt } : {}),
    ...(lockMetadata?.staleAfterSeconds !== undefined
      ? { staleAfterSeconds: lockMetadata.staleAfterSeconds }
      : {}),
    ...(input.phase === "remote-state-lock"
      ? { retryAfterSeconds: defaultLockRetryIntervalMs / 1_000 }
      : {}),
    ...(!lockMetadata && safeOutput(input.stderr)
      ? { stderr: safeOutput(input.stderr) ?? null }
      : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function retriableInfraError(
  message: string,
  details?: Record<string, string | number | boolean | null>,
): ReturnType<typeof domainError.infra> {
  return {
    code: "infra_error",
    category: "infra",
    message,
    retryable: true,
    ...(details ? { details } : {}),
  };
}

function remoteStateLockError(
  message: string,
  details?: Record<string, string | number | boolean | null>,
): ReturnType<typeof domainError.infra> {
  return {
    ...retriableInfraError(message, details),
    knowledge: resolvePublicDocsErrorKnowledge("infra_error.remote-state-lock"),
  };
}

function validateTarget(target: SshRemoteStateTarget): Result<void> {
  if (!trimmed(target.host)) {
    return err(
      domainError.validation("SSH remote state target host is required", {
        phase: "remote-state-resolution",
        stateBackend: "ssh-pglite",
      }),
    );
  }

  if (target.port !== undefined && (!Number.isInteger(target.port) || target.port <= 0)) {
    return err(
      domainError.validation("SSH remote state target port must be a positive integer", {
        phase: "remote-state-resolution",
        stateBackend: "ssh-pglite",
        host: target.host,
        port: String(target.port),
      }),
    );
  }

  return ok(undefined);
}

function targetFromDecisionTarget(
  target: TrustedSshTargetInput | undefined,
): Result<SshRemoteStateTarget> {
  if (!target) {
    return err(
      domainError.validation("SSH remote state target is required", {
        phase: "remote-state-resolution",
        stateBackend: "ssh-pglite",
      }),
    );
  }

  const resolvedTarget = {
    host: target.host,
    ...(target.port === undefined ? {} : { port: target.port }),
    ...(target.username ? { username: target.username } : {}),
    ...(target.identityFile ? { identityFile: target.identityFile } : {}),
  } satisfies SshRemoteStateTarget;
  const validation = validateTarget(resolvedTarget);
  if (validation.isErr()) {
    return err(validation.error);
  }

  return ok(resolvedTarget);
}

export function sshRemoteStateTargetFromDecision(
  decision: DeploymentStateBackendDecision,
): Result<SshRemoteStateTarget> {
  if (decision.kind !== "ssh-pglite") {
    return err(
      domainError.validation("SSH remote state target requires ssh-pglite backend", {
        phase: "remote-state-resolution",
        stateBackend: decision.kind,
      }),
    );
  }

  return targetFromDecisionTarget(decision.trustedSshTarget);
}

export class SshRemoteStateLifecycle {
  private readonly dataRoot: string;
  private readonly target: SshRemoteStateTarget;
  private readonly schemaVersion: number;
  private readonly owner: string;
  private readonly correlationId: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: SshRemoteCommandRunner;
  private readonly heartbeatIntervalMs: number | null;
  private readonly staleAfterMs: number;
  private readonly lockAcquireTimeoutMs: number;
  private readonly lockRetryIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatInFlight = false;

  constructor(options: SshRemoteStateLifecycleOptions) {
    this.dataRoot = options.dataRoot;
    this.target = options.target;
    this.schemaVersion = options.schemaVersion ?? defaultSchemaVersion;
    this.owner = options.owner ?? "appaloft-cli";
    this.correlationId = options.correlationId ?? defaultCorrelationId("remote_state");
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    this.runner = options.runner ?? new BunSshRemoteCommandRunner();
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs === undefined
        ? defaultLockHeartbeatIntervalMs
        : options.heartbeatIntervalMs && options.heartbeatIntervalMs > 0
          ? options.heartbeatIntervalMs
          : null;
    this.staleAfterMs =
      options.staleAfterMs && options.staleAfterMs > 0
        ? options.staleAfterMs
        : defaultLockStaleAfterMs;
    this.lockAcquireTimeoutMs =
      options.lockAcquireTimeoutMs !== undefined && options.lockAcquireTimeoutMs >= 0
        ? options.lockAcquireTimeoutMs
        : defaultLockAcquireTimeoutMs;
    this.lockRetryIntervalMs =
      options.lockRetryIntervalMs && options.lockRetryIntervalMs > 0
        ? options.lockRetryIntervalMs
        : defaultLockRetryIntervalMs;
  }

  async prepare(): Promise<Result<RemoteStateSession>> {
    const validation = validateTarget(this.target);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const prepared = await this.acquireLockWithRetry();
    if (prepared.isErr()) {
      return err(prepared.error);
    }

    this.startHeartbeat();
    return ok({
      dataRoot: this.dataRoot,
      schemaVersion: this.schemaVersion,
      release: () => this.release(),
    });
  }

  private async acquireLockWithRetry(): Promise<Result<void>> {
    const deadline =
      this.lockAcquireTimeoutMs > 0 ? Date.now() + this.lockAcquireTimeoutMs : Date.now();
    const startedAt = Date.now();

    while (true) {
      const result = await this.runner.run({
        target: this.target,
        command: remotePrepareCommand({
          dataRoot: this.dataRoot,
          schemaVersion: this.schemaVersion,
          owner: this.owner,
          correlationId: this.correlationId,
          staleAfterSeconds: Math.ceil(this.staleAfterMs / 1_000),
        }),
        cwd: this.cwd,
        env: this.env,
        redactions: this.target.identityFile ? [this.target.identityFile] : [],
      });

      if (!result.failed) {
        return ok(undefined);
      }

      const phase = phaseForPrepareFailure(result);
      const error =
        phase === "remote-state-lock"
          ? remoteStateLockError("SSH remote state mutation lock is already held", {
              ...errorDetails({
                target: this.target,
                phase,
                exitCode: result.exitCode,
                stderr: result.stderr,
                ...(result.reason ? { reason: result.reason } : {}),
              }),
              retryAfterSeconds: Math.ceil(this.lockRetryIntervalMs / 1_000),
              lockAcquireTimeoutSeconds: Math.ceil(this.lockAcquireTimeoutMs / 1_000),
            })
          : domainError.infra("SSH remote state could not be prepared", {
              ...errorDetails({
                target: this.target,
                phase,
                exitCode: result.exitCode,
                stderr: result.stderr,
                ...(result.reason ? { reason: result.reason } : {}),
              }),
            });

      if (phase !== "remote-state-lock" || Date.now() >= deadline) {
        return err(this.decorateLockTimeout(error, startedAt));
      }

      await sleep(Math.min(this.lockRetryIntervalMs, Math.max(0, deadline - Date.now())));
    }
  }

  private async release(): Promise<Result<void>> {
    this.stopHeartbeat();
    const result = await this.runner.run({
      target: this.target,
      command: remoteReleaseCommand({
        dataRoot: this.dataRoot,
        owner: this.owner,
        correlationId: this.correlationId,
      }),
      cwd: this.cwd,
      env: this.env,
      redactions: this.target.identityFile ? [this.target.identityFile] : [],
    });

    if (result.failed) {
      return err(
        domainError.infra(
          "SSH remote state mutation lock could not be released",
          errorDetails({
            target: this.target,
            phase: "remote-state-lock",
            exitCode: result.exitCode,
            stderr: result.stderr,
            ...(result.reason ? { reason: result.reason } : {}),
          }),
        ),
      );
    }

    return ok(undefined);
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalMs === null) {
      return;
    }
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.refreshHeartbeat();
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private async refreshHeartbeat(): Promise<void> {
    if (this.heartbeatInFlight) {
      return;
    }
    this.heartbeatInFlight = true;
    try {
      const result = await this.runner.run({
        target: this.target,
        command: remoteHeartbeatCommand({
          dataRoot: this.dataRoot,
          owner: this.owner,
          correlationId: this.correlationId,
          staleAfterSeconds: Math.ceil(this.staleAfterMs / 1_000),
        }),
        cwd: this.cwd,
        env: this.env,
        redactions: this.target.identityFile ? [this.target.identityFile] : [],
      });

      if (result.failed && result.exitCode === lockOwnershipExitCode) {
        this.stopHeartbeat();
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private decorateLockTimeout(
    error: ReturnType<typeof domainError.infra>,
    startedAt: number,
  ): ReturnType<typeof domainError.infra> {
    if (error.code !== "infra_error" || error.details?.phase !== "remote-state-lock") {
      return error;
    }

    return remoteStateLockError(error.message, {
      ...(error.details ?? {}),
      waitedSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)),
      lockAcquireTimeoutSeconds: Math.ceil(this.lockAcquireTimeoutMs / 1_000),
    });
  }
}
