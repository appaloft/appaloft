import { domainError, err, ok, type Result } from "@appaloft/core";
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
}

const defaultSchemaVersion = 1;
const lockConflictExitCode = 73;
const migrationFailureExitCode = 74;

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
}): string {
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `schema_version=${shellQuote(String(input.schemaVersion))}`,
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"',
    'mkdir -p "$data_root"',
    'mkdir -p "$data_root/pglite" "$data_root/locks" "$data_root/backups" "$data_root/journals" "$data_root/source-links" "$data_root/server-applied-routes"',
    'lock_dir="$data_root/locks/mutation.lock"',
    'if ! mkdir "$lock_dir"; then',
    '  if [ -f "$lock_dir/owner.json" ]; then cat "$lock_dir/owner.json" >&2; fi',
    `  exit ${lockConflictExitCode}`,
    "fi",
    `printf '{"owner":%s,"correlationId":%s,"startedAt":"%s"}\\n' ${shellQuote(jsonString(input.owner))} ${shellQuote(jsonString(input.correlationId))} "$now" > "$lock_dir/owner.json"`,
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

function remoteReleaseCommand(dataRoot: string): string {
  const script = [
    "set -eu",
    `data_root=${shellQuote(dataRoot)}`,
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
  return {
    phase: input.phase,
    stateBackend: "ssh-pglite",
    host: input.target.host,
    port: normalizePort(input.target.port),
    exitCode: input.exitCode,
    ...(safeOutput(input.stderr) ? { stderr: safeOutput(input.stderr) ?? null } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
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

  constructor(options: SshRemoteStateLifecycleOptions) {
    this.dataRoot = options.dataRoot;
    this.target = options.target;
    this.schemaVersion = options.schemaVersion ?? defaultSchemaVersion;
    this.owner = options.owner ?? "appaloft-cli";
    this.correlationId = options.correlationId ?? "cli";
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    this.runner = options.runner ?? new BunSshRemoteCommandRunner();
  }

  async prepare(): Promise<Result<RemoteStateSession>> {
    const validation = validateTarget(this.target);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const result = await this.runner.run({
      target: this.target,
      command: remotePrepareCommand({
        dataRoot: this.dataRoot,
        schemaVersion: this.schemaVersion,
        owner: this.owner,
        correlationId: this.correlationId,
      }),
      cwd: this.cwd,
      env: this.env,
      redactions: this.target.identityFile ? [this.target.identityFile] : [],
    });

    if (result.failed) {
      const phase = phaseForPrepareFailure(result);
      return err(
        domainError.infra(
          phase === "remote-state-lock"
            ? "SSH remote state mutation lock is already held"
            : "SSH remote state could not be prepared",
          errorDetails({
            target: this.target,
            phase,
            exitCode: result.exitCode,
            stderr: result.stderr,
            ...(result.reason ? { reason: result.reason } : {}),
          }),
        ),
      );
    }

    return ok({
      dataRoot: this.dataRoot,
      schemaVersion: this.schemaVersion,
      release: () => this.release(),
    });
  }

  private async release(): Promise<Result<void>> {
    const result = await this.runner.run({
      target: this.target,
      command: remoteReleaseCommand(this.dataRoot),
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
}
