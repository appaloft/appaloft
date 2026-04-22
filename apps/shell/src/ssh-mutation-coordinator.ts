import { createHash } from "node:crypto";
import { buildSshRemoteStateProcessArgs, type SshRemoteStateTarget } from "@appaloft/adapter-cli";
import {
  type Clock,
  coordinationTimeoutError,
  createRepositorySpanName,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  validateCoordinationScope,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

const lockConflictExitCode = 73;
const lockOwnershipExitCode = 75;

export interface SshMutationCoordinatorRunnerInput {
  target: SshRemoteStateTarget;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}

export interface SshMutationCoordinatorRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
}

export interface SshMutationCoordinatorRunner {
  run(
    input: SshMutationCoordinatorRunnerInput,
  ): Promise<SshMutationCoordinatorRunnerResult> | SshMutationCoordinatorRunnerResult;
}

export interface SshMutationCoordinatorOptions {
  dataRoot: string;
  target: SshRemoteStateTarget;
  clock: Clock;
  runner?: SshMutationCoordinatorRunner;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  refreshLocalState?: () => Promise<Result<void>>;
}

interface RemoteCoordinationLockMetadata {
  ownerId?: string;
  label?: string;
  lockToken?: string;
  operationKey?: string;
  coordinationMode?: string;
  scopeKind?: string;
  scopeKey?: string;
  startedAt?: string;
  lastHeartbeatAt?: string;
  staleAfterSeconds?: number;
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function defaultRunner(): SshMutationCoordinatorRunner {
  return {
    run(input) {
      const result = Bun.spawnSync(
        ["ssh", ...buildSshRemoteStateProcessArgs(input.target), input.command],
        {
          cwd: input.cwd,
          env: input.env,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stderr = result.stderr.toString();
      const redactedStderr = (input.redactions ?? []).reduce(
        (value, secret) => (secret.length > 0 ? value.replaceAll(secret, "[redacted]") : value),
        stderr,
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: redactedStderr,
        failed: !result.success,
      };
    },
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lockHash(scopeKey: string): string {
  return createHash("sha256").update(scopeKey).digest("hex").slice(0, 24);
}

function parseLockMetadata(stderr: string): RemoteCoordinationLockMetadata | null {
  const trimmedValue = stderr.trim();
  if (!trimmedValue.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedValue) as RemoteCoordinationLockMetadata;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function remoteAcquireCommand(input: {
  dataRoot: string;
  scopeKind: string;
  scopeHash: string;
  scopeKey: string;
  operationKey: string;
  coordinationMode: string;
  ownerId: string;
  label: string;
  lockToken: string;
  staleAfterSeconds: number;
}): string {
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `scope_kind=${shellQuote(input.scopeKind)}`,
    `scope_hash=${shellQuote(input.scopeHash)}`,
    `stale_after_seconds=${shellQuote(String(input.staleAfterSeconds))}`,
    'coordination_root="$data_root/locks/coordination"',
    'scope_root="$coordination_root/$scope_kind"',
    'recovered_root="$coordination_root/recovered/$scope_kind"',
    'lock_dir="$scope_root/$scope_hash.lock"',
    'owner_file="$lock_dir/owner.json"',
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'now_epoch="$(date -u +%s)"',
    'stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"',
    'mkdir -p "$scope_root" "$recovered_root"',
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
    '    heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || true)"',
    "  else",
    '    heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || true)"',
    "  fi",
    '  if [ -n "$heartbeat_epoch" ]; then',
    "    lock_age_seconds=$((now_epoch - heartbeat_epoch))",
    "  fi",
    '  if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then',
    '    recovered_path="$recovered_root/$scope_hash-$stamp-$$.lock"',
    '    if mv "$lock_dir" "$recovered_path" 2>/dev/null; then',
    `      printf '{"phase":"%s","recoveredAt":"%s","scopeKind":%s,"scopeKey":%s,"recoveredBy":%s,"lockToken":%s,"lockAgeSeconds":%s}\n' "operation-coordination" "$now" ${shellQuote(jsonString(input.scopeKind))} ${shellQuote(jsonString(input.scopeKey))} ${shellQuote(jsonString(input.ownerId))} ${shellQuote(jsonString(input.lockToken))} "$lock_age_seconds" > "$recovered_path/recovered.json"`,
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
    `printf '{"ownerId":%s,"label":%s,"lockToken":%s,"operationKey":%s,"coordinationMode":%s,"scopeKind":%s,"scopeKey":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":%s}\n' ${shellQuote(jsonString(input.ownerId))} ${shellQuote(jsonString(input.label))} ${shellQuote(jsonString(input.lockToken))} ${shellQuote(jsonString(input.operationKey))} ${shellQuote(jsonString(input.coordinationMode))} ${shellQuote(jsonString(input.scopeKind))} ${shellQuote(jsonString(input.scopeKey))} "$now" "$now" "$stale_after_seconds" > "$owner_file"`,
    'printf "coordinated %s %s\\n" "$scope_kind" "$scope_hash"',
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

function remoteHeartbeatCommand(input: {
  dataRoot: string;
  scopeKind: string;
  scopeHash: string;
  ownerId: string;
  lockToken: string;
  staleAfterSeconds: number;
}): string {
  const expectedOwnerIdFragment = `"ownerId":${jsonString(input.ownerId)}`;
  const expectedLockTokenFragment = `"lockToken":${jsonString(input.lockToken)}`;
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `scope_kind=${shellQuote(input.scopeKind)}`,
    `scope_hash=${shellQuote(input.scopeHash)}`,
    `stale_after_seconds=${shellQuote(String(input.staleAfterSeconds))}`,
    `expected_owner_id_fragment=${shellQuote(expectedOwnerIdFragment)}`,
    `expected_lock_token_fragment=${shellQuote(expectedLockTokenFragment)}`,
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'lock_dir="$data_root/locks/coordination/$scope_kind/$scope_hash.lock"',
    'owner_file="$lock_dir/owner.json"',
    '[ -d "$lock_dir" ] || exit 0',
    '[ -f "$owner_file" ] || exit 0',
    'grep -F "$expected_owner_id_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'grep -F "$expected_lock_token_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'started_at="$(sed -n \'s/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '[ -n "$started_at" ] || started_at="$now"',
    `sed -e 's/"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"[^"]*"/"lastHeartbeatAt":"'"$now"'"/' -e 's/"staleAfterSeconds"[[:space:]]*:[[:space:]]*[0-9][0-9]*/"staleAfterSeconds":'"$stale_after_seconds"'/' "$owner_file" > "$owner_file.tmp"`,
    'mv "$owner_file.tmp" "$owner_file"',
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

function remoteReleaseCommand(input: {
  dataRoot: string;
  scopeKind: string;
  scopeHash: string;
  ownerId: string;
  lockToken: string;
}): string {
  const expectedOwnerIdFragment = `"ownerId":${jsonString(input.ownerId)}`;
  const expectedLockTokenFragment = `"lockToken":${jsonString(input.lockToken)}`;
  const script = [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `scope_kind=${shellQuote(input.scopeKind)}`,
    `scope_hash=${shellQuote(input.scopeHash)}`,
    `expected_owner_id_fragment=${shellQuote(expectedOwnerIdFragment)}`,
    `expected_lock_token_fragment=${shellQuote(expectedLockTokenFragment)}`,
    'lock_dir="$data_root/locks/coordination/$scope_kind/$scope_hash.lock"',
    'owner_file="$lock_dir/owner.json"',
    '[ -d "$lock_dir" ] || exit 0',
    '[ -f "$owner_file" ] || { rm -rf "$lock_dir"; exit 0; }',
    'grep -F "$expected_owner_id_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'grep -F "$expected_lock_token_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }',
    'rm -rf "$lock_dir"',
    'printf "released %s %s\\n" "$scope_kind" "$scope_hash"',
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

function remoteInfraError(input: {
  message: string;
  target: SshRemoteStateTarget;
  phase: string;
  exitCode: number;
  stderr: string;
  scopeKind: string;
  scopeKey: string;
  operationKey: string;
}): ReturnType<typeof domainError.infra> {
  const metadata = parseLockMetadata(input.stderr);

  return {
    code: "infra_error",
    category: "infra",
    message: input.message,
    retryable: true,
    details: {
      phase: input.phase,
      stateBackend: "ssh-pglite",
      host: input.target.host,
      port: String(input.target.port ?? 22),
      exitCode: input.exitCode,
      coordinationScopeKind: input.scopeKind,
      coordinationScope: input.scopeKey,
      operationKey: input.operationKey,
      ...(metadata?.ownerId ? { ownerId: metadata.ownerId } : {}),
      ...(metadata?.label ? { ownerLabel: metadata.label } : {}),
      ...(metadata?.startedAt ? { lockStartedAt: metadata.startedAt } : {}),
      ...(metadata?.lastHeartbeatAt ? { lockHeartbeatAt: metadata.lastHeartbeatAt } : {}),
      ...(metadata?.staleAfterSeconds === undefined
        ? {}
        : { staleAfterSeconds: metadata.staleAfterSeconds }),
      ...(input.stderr.trim() ? { stderr: input.stderr.trim().slice(0, 2_000) } : {}),
    },
  };
}

export class SshMutationCoordinator implements MutationCoordinator {
  private readonly runner: SshMutationCoordinatorRunner;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly options: SshMutationCoordinatorOptions) {
    this.runner = options.runner ?? defaultRunner();
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
  }

  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    const scopeValidation = validateCoordinationScope(input.scope);
    if (scopeValidation.isErr()) {
      return err(scopeValidation.error);
    }

    const startedAt = Date.now();
    const deadline = startedAt + input.policy.waitTimeoutMs;
    const scopeKind = input.scope.kind;
    const scopeKey = input.scope.key;
    const scopeHash = lockHash(scopeKey);
    const lockToken = `${input.owner.ownerId}:${process.pid}:${Date.now().toString(36)}`;
    let waitedForScope = false;

    return input.context.tracer.startActiveSpan(
      createRepositorySpanName("ssh_mutation_coordinator", "run_exclusive"),
      {
        attributes: {
          "appaloft.repository.name": "ssh_mutation_coordinator",
          "appaloft.mutation.scope_kind": scopeKind,
          "appaloft.mutation.scope_key": scopeKey,
          "appaloft.mutation.operation_key": input.policy.operationKey,
          "appaloft.mutation.mode": input.policy.mode,
          "appaloft.state_backend": "ssh-pglite",
        },
      },
      async () => {
        while (Date.now() <= deadline) {
          const acquired = await this.runner.run({
            target: this.options.target,
            command: remoteAcquireCommand({
              dataRoot: this.options.dataRoot,
              scopeKind,
              scopeHash,
              scopeKey,
              operationKey: input.policy.operationKey,
              coordinationMode: input.policy.mode,
              ownerId: input.owner.ownerId,
              label: input.owner.label,
              lockToken,
              staleAfterSeconds: Math.ceil(input.policy.leaseTtlMs / 1_000),
            }),
            cwd: this.cwd,
            env: this.env,
            ...(this.options.target.identityFile
              ? { redactions: [this.options.target.identityFile] }
              : {}),
          });

          if (!acquired.failed) {
            return this.executeWithLease(
              input,
              {
                scopeHash,
                lockToken,
              },
              waitedForScope,
            );
          }

          if (acquired.exitCode !== lockConflictExitCode) {
            return err(
              remoteInfraError({
                message: "SSH mutation coordination could not be acquired",
                target: this.options.target,
                phase: "operation-coordination",
                exitCode: acquired.exitCode,
                stderr: acquired.stderr,
                scopeKind,
                scopeKey,
                operationKey: input.policy.operationKey,
              }),
            );
          }

          if (Date.now() >= deadline) {
            break;
          }

          waitedForScope = true;
          await sleep(input.policy.retryIntervalMs);
        }

        return err(
          coordinationTimeoutError({
            message:
              "Command coordination scope could not be acquired within the bounded wait window",
            policy: input.policy,
            scope: input.scope,
            waitedSeconds: Math.max(1, Math.ceil((Date.now() - startedAt) / 1_000)),
            retryAfterSeconds: Math.max(1, Math.ceil(input.policy.retryIntervalMs / 1_000)),
          }),
        );
      },
    );
  }

  private async executeWithLease<T>(
    input: MutationCoordinatorRunExclusiveInput<T>,
    lease: { scopeHash: string; lockToken: string },
    waitedForScope: boolean,
  ): Promise<Result<T>> {
    let heartbeatError: DomainError | null = null;
    let heartbeatInFlight: Promise<void> | null = null;
    const heartbeatTimer =
      input.policy.heartbeatIntervalMs > 0
        ? setInterval(() => {
            if (heartbeatInFlight || heartbeatError) {
              return;
            }

            heartbeatInFlight = (async () => {
              const result = await this.runner.run({
                target: this.options.target,
                command: remoteHeartbeatCommand({
                  dataRoot: this.options.dataRoot,
                  scopeKind: input.scope.kind,
                  scopeHash: lease.scopeHash,
                  ownerId: input.owner.ownerId,
                  lockToken: lease.lockToken,
                  staleAfterSeconds: Math.ceil(input.policy.leaseTtlMs / 1_000),
                }),
                cwd: this.cwd,
                env: this.env,
                ...(this.options.target.identityFile
                  ? { redactions: [this.options.target.identityFile] }
                  : {}),
              });
              if (!result.failed) {
                return;
              }

              heartbeatError = remoteInfraError({
                message:
                  result.exitCode === lockOwnershipExitCode
                    ? "SSH mutation coordination ownership was lost while the command was running"
                    : "SSH mutation coordination heartbeat failed",
                target: this.options.target,
                phase: "operation-coordination",
                exitCode: result.exitCode,
                stderr: result.stderr,
                scopeKind: input.scope.kind,
                scopeKey: input.scope.key,
                operationKey: input.policy.operationKey,
              });
            })().finally(() => {
              heartbeatInFlight = null;
            });
          }, input.policy.heartbeatIntervalMs)
        : null;

    let workResult: Result<T> | null = null;
    let releaseError: DomainError | null = null;

    try {
      if (waitedForScope) {
        if (!this.options.refreshLocalState) {
          return err(
            domainError.infra(
              "SSH mutation coordination acquired after waiting, but local state refresh is unavailable",
              {
                phase: "operation-coordination",
                stateBackend: "ssh-pglite",
                coordinationScopeKind: input.scope.kind,
                coordinationScope: input.scope.key,
                operationKey: input.policy.operationKey,
                reason: "remote_state_refresh_unavailable",
              },
            ),
          );
        }

        const refreshed = await this.options.refreshLocalState();
        if (refreshed.isErr()) {
          return err(refreshed.error);
        }
      }

      workResult = await input.work();
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      const pendingHeartbeat: Promise<void> | null = heartbeatInFlight;
      if (pendingHeartbeat) {
        try {
          await pendingHeartbeat;
        } catch {
          // Ignore heartbeat shutdown errors and prefer the command/release outcome below.
        }
      }

      const released = await this.runner.run({
        target: this.options.target,
        command: remoteReleaseCommand({
          dataRoot: this.options.dataRoot,
          scopeKind: input.scope.kind,
          scopeHash: lease.scopeHash,
          ownerId: input.owner.ownerId,
          lockToken: lease.lockToken,
        }),
        cwd: this.cwd,
        env: this.env,
        ...(this.options.target.identityFile
          ? { redactions: [this.options.target.identityFile] }
          : {}),
      });

      if (released.failed && workResult?.isOk()) {
        releaseError = remoteInfraError({
          message:
            released.exitCode === lockOwnershipExitCode
              ? "SSH mutation coordination ownership was lost before release"
              : "SSH mutation coordination release failed",
          target: this.options.target,
          phase: "operation-coordination",
          exitCode: released.exitCode,
          stderr: released.stderr,
          scopeKind: input.scope.kind,
          scopeKey: input.scope.key,
          operationKey: input.policy.operationKey,
        });
      }
    }

    if (releaseError) {
      return err(releaseError);
    }
    if (heartbeatError) {
      return err(heartbeatError);
    }
    if (!workResult) {
      return err(
        domainError.infra("SSH mutation coordination finished without a work result", {
          phase: "operation-coordination",
          stateBackend: "ssh-pglite",
        }),
      );
    }
    if (workResult.isErr()) {
      return err(workResult.error);
    }

    return ok(workResult.value);
  }
}
