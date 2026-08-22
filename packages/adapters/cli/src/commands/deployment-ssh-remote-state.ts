import { randomUUID } from "node:crypto";
import { type AshScript, ash } from "@appaloft/ash";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { resolvePublicDocsErrorKnowledge } from "@appaloft/docs-registry";
import { type RemoteStateSession } from "./deployment-remote-state.js";
import {
  type DeploymentStateBackendDecision,
  isDeploymentStateBackendKind,
  serverStateBackendMarkerFile,
  serverStateBackendMarkerSchemaVersion,
  serverStateBackendMismatchError,
  serverStateBackendMismatchReason,
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
  readOnly?: boolean;
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
  lockToken?: string;
}

const defaultSchemaVersion = 1;
const defaultLockHeartbeatIntervalMs = 30_000;
const defaultLockStaleAfterMs = 20 * 60_000;
const defaultLockAcquireTimeoutMs = 3 * 60_000;
const defaultLockRetryIntervalMs = 1_000;
const lockConflictExitCode = 73;
const migrationFailureExitCode = 74;
const lockOwnershipExitCode = 75;
const stateBackendMismatchExitCode = 77;

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

function parseStateBackendMismatch(stderr: string): {
  actualStateBackend?: DeploymentStateBackendDecision["kind"];
} | null {
  const trimmedValue = stderr.trim();
  if (!trimmedValue.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedValue) as { actualStateBackend?: unknown };
    return {
      ...(isDeploymentStateBackendKind(parsed.actualStateBackend)
        ? { actualStateBackend: parsed.actualStateBackend }
        : {}),
    };
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

function renderShLcCommand(script: AshScript): string {
  return ash.render(ash`sh -lc ${ash.arg(ash.render(script))}`).trim();
}

export function renderSshRemoteStateMutationGuard(input: {
  operation: string;
  owner: string;
  correlationId: string;
  staleAfterSeconds?: number;
}): AshScript {
  return ash`
    ${ash.env("guard_operation", input.operation)}
    ${ash.env("guard_owner_json", jsonString(input.owner))}
    ${ash.env("guard_correlation_id_json", jsonString(input.correlationId))}
    ${ash.env("guard_stale_after_seconds", input.staleAfterSeconds ?? 30)}
    ${ash.raw(`guard_dir="$data_root/locks/mutation.guard"
    guard_owner_file="$guard_dir/owner.json"
    guard_owner_temp="$guard_dir/.owner-$$.tmp"
    guard_owned=false
    guard_kernel_owned=false
    guard_token=""
    guard_json_string() { if [ "$#" -eq 0 ] || [ -z "$1" ]; then printf null; return; fi; printf '"'; printf "%s" "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; printf '"'; }
    guard_sync_path() { sync "$1" 2>/dev/null || sync; }
    acquire_guard() {
      command -v flock >/dev/null 2>&1 || { echo "remote state mutation guard requires flock" >&2; return 75; }
      exec 9<"$data_root/locks" || return 75
      if ! flock -w 5 9; then
        exec 9<&-
        return 73
      fi
      guard_kernel_owned=true
      guard_now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      guard_now_epoch="$(date -u +%s)"
      guard_stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
      if [ -r /proc/sys/kernel/random/uuid ]; then
        guard_uuid="$(tr -d '\\r\\n' < /proc/sys/kernel/random/uuid)"
      elif command -v uuidgen >/dev/null 2>&1; then
        guard_uuid="$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '\\r\\n')"
      else
        echo "remote state mutation guard requires UUID support" >&2
        return 75
      fi
      case "$guard_uuid" in *[!A-Za-z0-9-]*|'') echo "remote state mutation guard UUID is invalid" >&2; return 75 ;; esac
      guard_token="$guard_operation-$guard_uuid"
      if [ -e "$guard_dir" ] || [ -L "$guard_dir" ]; then
        [ -d "$guard_dir" ] && [ ! -L "$guard_dir" ] || { echo "remote state mutation guard is not a real directory" >&2; return 75; }
        guard_observed_token=""
        guard_observed_owner=""
        guard_observed_correlation=""
        guard_observed_at=""
        guard_observed_stale_after=""
        if [ -e "$guard_owner_file" ] || [ -L "$guard_owner_file" ]; then
          [ -f "$guard_owner_file" ] && [ ! -L "$guard_owner_file" ] || { echo "remote state mutation guard owner is not a real file" >&2; return 75; }
          guard_observed_token="$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$guard_owner_file" | head -n 1 || true)"
          guard_observed_owner="$(sed -n 's/.*"owner"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$guard_owner_file" | head -n 1 || true)"
          guard_observed_correlation="$(sed -n 's/.*"correlationId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$guard_owner_file" | head -n 1 || true)"
          guard_observed_at="$(sed -n 's/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$guard_owner_file" | head -n 1 || true)"
          guard_observed_stale_after="$(sed -n 's/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$guard_owner_file" | head -n 1 || true)"
        fi
        [ -n "$guard_observed_stale_after" ] || guard_observed_stale_after="$guard_stale_after_seconds"
        if [ "$guard_observed_stale_after" -gt "$guard_stale_after_seconds" ]; then guard_observed_stale_after="$guard_stale_after_seconds"; fi
        if [ -n "$guard_observed_at" ]; then
          guard_observed_epoch="$(date -u -d "$guard_observed_at" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$guard_observed_at" +%s 2>/dev/null || true)"
        else
          guard_observed_epoch=""
        fi
        if [ -z "$guard_observed_epoch" ]; then guard_observed_epoch="$(stat -c %Y "$guard_dir" 2>/dev/null || stat -f %m "$guard_dir" 2>/dev/null || true)"; fi
        [ -n "$guard_observed_epoch" ] || { echo "remote state mutation guard age is unavailable" >&2; return 75; }
        guard_age_seconds=$((guard_now_epoch - guard_observed_epoch))
        if [ "$guard_age_seconds" -lt "$guard_observed_stale_after" ]; then
          release_guard || return 75
          return 73
        fi
        guard_recovered_dir="$data_root/locks/recovered"
        if [ -e "$guard_recovered_dir" ] || [ -L "$guard_recovered_dir" ]; then
          [ -d "$guard_recovered_dir" ] && [ ! -L "$guard_recovered_dir" ] || return 75
        else
          mkdir "$guard_recovered_dir" || return 75
        fi
        guard_recovered_path="$guard_recovered_dir/guard-$guard_stamp-$guard_uuid.guard"
        guard_recovery_record="$guard_recovered_dir/.guard-$guard_stamp-$guard_uuid.recovered.json"
        [ ! -e "$guard_recovered_path" ] && [ ! -L "$guard_recovered_path" ] || return 75
        [ ! -e "$guard_recovery_record" ] && [ ! -L "$guard_recovery_record" ] || return 75
        printf '{"phase":"remote-state-guard","status":"planned","recoveredAt":"%s","recoveredBy":"%s","observedToken":%s,"observedOwner":%s,"observedCorrelationId":%s,"lockAgeSeconds":%s,"staleAfterSeconds":%s,"plannedArchivePath":%s,"reason":"kernel-lock-owner-absent"}\\n' "$guard_now" "$guard_operation" "$(guard_json_string "$guard_observed_token")" "$(guard_json_string "$guard_observed_owner")" "$(guard_json_string "$guard_observed_correlation")" "$guard_age_seconds" "$guard_observed_stale_after" "$(guard_json_string "$guard_recovered_path")" > "$guard_recovery_record" || return 75
        guard_sync_path "$guard_recovery_record" || return 75
        guard_sync_path "$guard_recovered_dir" || return 75
        mv "$guard_dir" "$guard_recovered_path" || return 75
        mv "$guard_recovery_record" "$guard_recovered_path/recovered.json" || return 75
        guard_sync_path "$guard_recovered_dir" || return 75
        guard_completed_record="$guard_recovered_path/.recovered-$$.tmp"
        printf '{"phase":"remote-state-guard","status":"completed","recoveredAt":"%s","recoveredBy":"%s","observedToken":%s,"lockAgeSeconds":%s,"archivePath":%s,"reason":"kernel-lock-owner-absent"}\\n' "$guard_now" "$guard_operation" "$(guard_json_string "$guard_observed_token")" "$guard_age_seconds" "$(guard_json_string "$guard_recovered_path")" > "$guard_completed_record" && mv "$guard_completed_record" "$guard_recovered_path/recovered.json" || true
      fi
      guard_mkdir_error=""
      if ! guard_mkdir_error="$(mkdir "$guard_dir" 2>&1)"; then
        [ -z "$guard_mkdir_error" ] || printf '%s\\n' "$guard_mkdir_error" >&2
        return 75
      fi
      guard_owned=true
      if ! printf '{"schemaVersion":1,"token":"%s","owner":%s,"correlationId":%s,"operation":"%s","pid":%s,"acquiredAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":%s}\\n' "$guard_token" "$guard_owner_json" "$guard_correlation_id_json" "$guard_operation" "$$" "$guard_now" "$guard_now" "$guard_stale_after_seconds" > "$guard_owner_temp" || ! mv "$guard_owner_temp" "$guard_owner_file"; then
        rm -f "$guard_owner_temp" "$guard_owner_file" 2>/dev/null || true
        rmdir "$guard_dir" 2>/dev/null || true
        guard_owned=false
        return 75
      fi
    }
    release_guard() {
      guard_release_status=0
      if [ "$guard_owned" = true ]; then
        guard_token_fragment="$(printf '"token":"%s"' "$guard_token")"
        [ -d "$guard_dir" ] && [ ! -L "$guard_dir" ] || guard_release_status=75
        if [ "$guard_release_status" -eq 0 ]; then
          [ -f "$guard_owner_file" ] && [ ! -L "$guard_owner_file" ] || guard_release_status=75
        fi
        if [ "$guard_release_status" -eq 0 ]; then
          grep -F "$guard_token_fragment" "$guard_owner_file" >/dev/null 2>&1 || guard_release_status=75
        fi
        if [ "$guard_release_status" -eq 0 ]; then
          guard_release_dir="$data_root/locks/.mutation-guard-release-$guard_token"
          [ ! -e "$guard_release_dir" ] && [ ! -L "$guard_release_dir" ] || guard_release_status=75
        fi
        if [ "$guard_release_status" -eq 0 ]; then
          mv "$guard_dir" "$guard_release_dir" || guard_release_status=75
        fi
        if [ "$guard_release_status" -eq 0 ]; then
          guard_released_owner="$guard_release_dir/owner.json"
          if [ -f "$guard_released_owner" ] && [ ! -L "$guard_released_owner" ] && grep -F "$guard_token_fragment" "$guard_released_owner" >/dev/null 2>&1; then
            rm -rf "$guard_release_dir" || guard_release_status=75
          else
            if [ ! -e "$guard_dir" ] && [ ! -L "$guard_dir" ]; then mv "$guard_release_dir" "$guard_dir" 2>/dev/null || true; fi
            guard_release_status=75
          fi
        fi
        if [ "$guard_release_status" -eq 0 ]; then guard_owned=false; fi
      fi
      if [ "$guard_kernel_owned" = true ]; then
        flock -u 9 || guard_release_status=75
        exec 9<&-
        guard_kernel_owned=false
      fi
      return "$guard_release_status"
    }`)}
  `;
}

function remotePrepareCommand(input: {
  dataRoot: string;
  schemaVersion: number;
  owner: string;
  correlationId: string;
  lockToken: string;
  staleAfterSeconds: number;
  readOnly: boolean;
}): AshScript {
  return ash`
    set -eu
    ${ash.env("data_root", input.dataRoot)}
    ${ash.env("schema_version", input.schemaVersion)}
    ${ash.env("stale_after_seconds", input.staleAfterSeconds)}
    ${ash.env("read_only", input.readOnly ? "true" : "false")}
    ${ash.env("owner_json", jsonString(input.owner))}
    ${ash.env("correlation_id_json", jsonString(input.correlationId))}
    ${ash.env("lock_token", input.lockToken)}
    ${ash.env("lock_token_json", jsonString(input.lockToken))}
    ${ash.raw(`now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    now_epoch="$(date -u +%s)"
    stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
    if [ -e "$data_root" ] || [ -L "$data_root" ]; then
      [ -d "$data_root" ] && [ ! -L "$data_root" ] || { echo "remote state root is not a real directory" >&2; exit 1; }
    elif [ "$read_only" = true ]; then
      echo "remote state root does not exist" >&2
      exit 1
    else
      mkdir -p "$data_root"
    fi
    recovery_dir="$data_root/recovery"
    if [ -e "$recovery_dir" ] || [ -L "$recovery_dir" ]; then
      [ -d "$recovery_dir" ] && [ ! -L "$recovery_dir" ] || { echo "remote state recovery path is not a real directory" >&2; exit 1; }
    elif [ "$read_only" != true ]; then
      mkdir -p "$recovery_dir"
    fi
    if [ "$read_only" = true ]; then
      [ -d "$data_root/pglite" ] && [ ! -L "$data_root/pglite" ] || { echo "remote PGlite state does not exist as a real directory" >&2; exit 1; }
      [ -d "$data_root/locks" ] && [ ! -L "$data_root/locks" ] || { echo "remote state lock directory does not exist as a real directory" >&2; exit 1; }
    else
      for owned_dir in "$data_root/pglite" "$data_root/locks" "$data_root/backups" "$data_root/journals" "$data_root/source-links" "$data_root/server-applied-routes"; do
        if [ -e "$owned_dir" ] || [ -L "$owned_dir" ]; then
          [ -d "$owned_dir" ] && [ ! -L "$owned_dir" ] || { echo "remote state owned path is not a real directory" >&2; exit 1; }
        else
          mkdir -p "$owned_dir"
        fi
      done
      recovered_dir="$data_root/locks/recovered"
      if [ -e "$recovered_dir" ] || [ -L "$recovered_dir" ]; then
        [ -d "$recovered_dir" ] && [ ! -L "$recovered_dir" ] || { echo "remote recovered-lock path is not a real directory" >&2; exit 1; }
      else
        mkdir -p "$recovered_dir"
      fi
    fi`)}
    ${ash.raw(`lock_dir="$data_root/locks/mutation.lock"
    owner_file="$lock_dir/owner.json"
    marker="$data_root/schema-version.json"
    backend_marker="$data_root/${serverStateBackendMarkerFile}"
    actual_backend=""
    if [ -e "$backend_marker" ] || [ -L "$backend_marker" ]; then
      [ -f "$backend_marker" ] && [ ! -L "$backend_marker" ] || { echo "remote state backend marker is not a real file" >&2; exit 1; }
      actual_backend="$(sed -n 's/.*"stateBackend"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$backend_marker" | head -n 1 || true)"
    fi
    if [ -n "$actual_backend" ] && [ "$actual_backend" != "ssh-pglite" ]; then
      printf '{"phase":"server-state-backend","reason":${jsonString(serverStateBackendMismatchReason)},"expectedStateBackend":"ssh-pglite","actualStateBackend":"%s"}\\n' "$actual_backend" >&2
      exit ${stateBackendMismatchExitCode}
    fi
    if [ -e "$lock_dir" ] || [ -L "$lock_dir" ]; then
      [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || { echo "remote state mutation lock is not a real directory" >&2; exit 1; }
    fi
    if [ -e "$owner_file" ] || [ -L "$owner_file" ]; then
      [ -f "$owner_file" ] && [ ! -L "$owner_file" ] || { echo "remote state lock owner is not a real file" >&2; exit 1; }
    fi
    if [ -e "$marker" ] || [ -L "$marker" ]; then
      [ -f "$marker" ] && [ ! -L "$marker" ] || { echo "remote state schema marker is not a real file" >&2; exit 1; }
    fi
    if [ "$read_only" = true ]; then
      if [ -e "$lock_dir" ]; then
        if [ -f "$owner_file" ]; then cat "$owner_file" >&2; fi
        exit ${lockConflictExitCode}
      fi
      actual_version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$marker" | head -n 1 || true)"
      if [ "$actual_version" != "$schema_version" ]; then
        echo "remote state schema marker failed integrity check" >&2
        exit ${migrationFailureExitCode}
      fi
      printf "prepared %s schema=%s\\n" "$data_root" "$schema_version"
      exit 0
    fi`)}
    ${renderSshRemoteStateMutationGuard({
      operation: "prepare",
      owner: input.owner,
      correlationId: input.correlationId,
    })}
    ${ash.raw(`
    lock_created=false
    owner_written=false
    cleanup_prepare_lock() {
      prepare_status="$?"
      trap - EXIT HUP INT TERM
      if [ "$lock_created" = true ]; then
        if [ "$guard_owned" != true ]; then acquire_guard || true; fi
        if [ "$guard_owned" = true ] && [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ]; then
          cleanup_allowed=false
          if [ "$owner_written" != true ]; then
            cleanup_allowed=true
          elif [ -f "$owner_file" ] && [ ! -L "$owner_file" ] && grep -F "$lock_token_json" "$owner_file" >/dev/null 2>&1; then
            cleanup_allowed=true
          fi
          if [ "$cleanup_allowed" = true ]; then
            failed_lock_dir="$data_root/locks/.mutation-prepare-failed-$$"
            if [ ! -e "$failed_lock_dir" ] && [ ! -L "$failed_lock_dir" ] && mv "$lock_dir" "$failed_lock_dir" 2>/dev/null; then rm -rf "$failed_lock_dir" || true; fi
          fi
        fi
      fi
      release_guard || true
      exit "$prepare_status"
    }
    trap cleanup_prepare_lock EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    acquire_guard || exit $?
    printf '{"schemaVersion":${jsonString(serverStateBackendMarkerSchemaVersion)},"stateBackend":"ssh-pglite","updatedAt":"%s","owner":%s}\\n' "$now" "$owner_json" > "$backend_marker"
    if ! mkdir "$lock_dir"; then
      if [ ! -d "$lock_dir" ] || [ -L "$lock_dir" ]; then
        echo "remote state mutation lock could not be created" >&2
        exit 1
      fi
      last_heartbeat=""
      owner_file_present=false
      recorded_stale_after=""
      lock_age_seconds=""
      if [ -f "$owner_file" ]; then
        owner_file_present=true
        last_heartbeat="$(sed -n 's/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
        if [ -z "$last_heartbeat" ]; then
          last_heartbeat="$(sed -n 's/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
        fi
        recorded_stale_after="$(sed -n 's/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$owner_file" | head -n 1 || true)"
      fi
      [ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"
      if [ "$recorded_stale_after" -gt "$stale_after_seconds" ]; then recorded_stale_after="$stale_after_seconds"; fi
      if [ "$owner_file_present" != true ] && [ "$recorded_stale_after" -gt 30 ]; then recorded_stale_after=30; fi
      if [ -n "$last_heartbeat" ]; then
        heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"
      else
        heartbeat_epoch=""
      fi
      if [ -z "$heartbeat_epoch" ]; then
        heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"
      fi
      if [ -n "$heartbeat_epoch" ]; then
        lock_age_seconds=$((now_epoch - heartbeat_epoch))
      fi
      if [ "$read_only" != true ] && [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then
        recovered_path="$data_root/locks/recovered/mutation-$stamp-$$.lock"
        recovery_record_temp="$data_root/locks/recovered/.mutation-$stamp-$$.recovered.json"
        [ ! -e "$recovered_path" ] && [ ! -L "$recovered_path" ] || exit 1
        [ ! -e "$recovery_record_temp" ] && [ ! -L "$recovery_record_temp" ] || exit 1
        [ ! -e "$lock_dir/recovered.json" ] && [ ! -L "$lock_dir/recovered.json" ] || exit 1
        printf '{"phase":"%s","status":"planned","recoveredAt":"%s","recoveredBy":%s,"correlationId":%s,"lockAgeSeconds":%s}\\n' "remote-state-lock" "$now" "$owner_json" "$correlation_id_json" "$lock_age_seconds" > "$recovery_record_temp"
        guard_sync_path "$recovery_record_temp" || exit 75
        guard_sync_path "$data_root/locks/recovered" || exit 75
        if mv "$lock_dir" "$recovered_path" 2>/dev/null; then
          mv "$recovery_record_temp" "$recovered_path/recovered.json"
          guard_sync_path "$data_root/locks/recovered" || exit 75
          mkdir "$lock_dir"
        else
          rm -f "$recovery_record_temp"
          if [ -f "$owner_file" ]; then cat "$owner_file" >&2; fi
          exit ${lockConflictExitCode}
        fi
      else
        if [ -f "$owner_file" ]; then cat "$owner_file" >&2; fi
        exit ${lockConflictExitCode}
      fi
    fi
    lock_created=true
    [ ! -e "$owner_file" ] && [ ! -L "$owner_file" ] || { rm -rf "$lock_dir"; echo "remote state lock owner path already exists" >&2; exit 1; }
    printf '{"owner":%s,"correlationId":%s,"lockToken":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":%s}\\n' "$owner_json" "$correlation_id_json" "$lock_token_json" "$now" "$now" "$stale_after_seconds" > "$owner_file"
    owner_written=true
    release_guard || exit $?
    current_version=0
    if [ -f "$marker" ]; then
      current_version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$marker" | head -n 1 || true)"
    fi
    [ -n "$current_version" ] || current_version=0
    if [ "$read_only" != true ] && [ "$current_version" != "$schema_version" ]; then
      backup_path="$data_root/backups/schema-$current_version-to-$schema_version-$stamp.json"
      journal_path="$data_root/journals/schema-$current_version-to-$schema_version-$stamp.json"
      [ ! -e "$backup_path" ] && [ ! -L "$backup_path" ] || exit 1
      [ ! -e "$journal_path" ] && [ ! -L "$journal_path" ] || exit 1
      if [ -f "$marker" ]; then cp "$marker" "$backup_path"; else printf "{}\\n" > "$backup_path"; fi
      printf '{"phase":"remote-state-migration","fromVersion":%s,"toVersion":%s,"startedAt":"%s"}\\n' "$current_version" "$schema_version" "$now" > "$journal_path"
      printf '{"version":%s,"migratedAt":"%s"}\\n' "$schema_version" "$now" > "$marker"
    fi
    actual_version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$marker" | head -n 1 || true)"
    if [ "$actual_version" != "$schema_version" ]; then
      if [ "$read_only" != true ]; then
        recovery_record="$recovery_dir/schema-migration.json"
        if [ -e "$recovery_record" ] || [ -L "$recovery_record" ]; then
          [ -f "$recovery_record" ] && [ ! -L "$recovery_record" ] || exit 1
        fi
        printf '{"phase":"remote-state-recovery","message":"schema marker integrity check failed","recordedAt":"%s"}\\n' "$now" > "$recovery_record"
      fi
      echo "remote state schema marker failed integrity check" >&2
      exit ${migrationFailureExitCode}
    fi
    trap - EXIT HUP INT TERM
    printf "prepared %s schema=%s\\n" "$data_root" "$schema_version"`)}
  `;
}

function remoteHeartbeatCommand(input: {
  dataRoot: string;
  owner: string;
  correlationId: string;
  lockToken: string;
  staleAfterSeconds: number;
}): AshScript {
  const expectedLockTokenFragment = `"lockToken":${jsonString(input.lockToken)}`;
  return ash`
    set -eu
    ${ash.env("data_root", input.dataRoot)}
    ${ash.env("stale_after_seconds", input.staleAfterSeconds)}
    ${ash.env("expected_lock_token_fragment", expectedLockTokenFragment)}
    ${ash.env("owner_json", jsonString(input.owner))}
    ${ash.env("correlation_id_json", jsonString(input.correlationId))}
    ${ash.env("lock_token_json", jsonString(input.lockToken))}
    ${ash.raw(`now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    lock_dir="$data_root/locks/mutation.lock"
    owner_file="$lock_dir/owner.json"
    owner_temp="$lock_dir/.owner-heartbeat-$$.tmp"`)}
    ${renderSshRemoteStateMutationGuard({
      operation: "heartbeat",
      owner: input.owner,
      correlationId: input.correlationId,
    })}
    ${ash.raw(`
    cleanup_heartbeat() { rm -f "$owner_temp" 2>/dev/null || true; release_guard || true; }
    trap cleanup_heartbeat EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    [ -d "$data_root" ] && [ ! -L "$data_root" ] || exit 75
    [ -d "$data_root/locks" ] && [ ! -L "$data_root/locks" ] || exit 75
    acquire_guard || exit $?
    if [ ! -e "$lock_dir" ] && [ ! -L "$lock_dir" ]; then exit 0; fi
    [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || exit 75
    [ -f "$owner_file" ] && [ ! -L "$owner_file" ] || exit 75
    grep -F "$expected_lock_token_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }
    started_at="$(sed -n 's/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
    [ -n "$started_at" ] || started_at="$now"
    [ ! -e "$owner_temp" ] && [ ! -L "$owner_temp" ] || exit 75
    printf '{"owner":%s,"correlationId":%s,"lockToken":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":%s}\\n' "$owner_json" "$correlation_id_json" "$lock_token_json" "$started_at" "$now" "$stale_after_seconds" > "$owner_temp"
    [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || exit 75
    [ -f "$owner_file" ] && [ ! -L "$owner_file" ] || exit 75
    grep -F "$expected_lock_token_fragment" "$owner_file" >/dev/null 2>&1 || exit 75
    mv "$owner_temp" "$owner_file"
    release_guard || exit $?
    trap - EXIT HUP INT TERM`)}
  `;
}

function remoteReleaseCommand(input: {
  dataRoot: string;
  owner: string;
  correlationId: string;
  lockToken: string;
}): AshScript {
  const expectedLockTokenFragment = `"lockToken":${jsonString(input.lockToken)}`;
  return ash`
    set -eu
    ${ash.env("data_root", input.dataRoot)}
    ${ash.env("expected_lock_token_fragment", expectedLockTokenFragment)}
    ${ash.raw(`lock_dir="$data_root/locks/mutation.lock"
    owner_file="$lock_dir/owner.json"
    release_dir="$data_root/locks/.mutation-release-$$"`)}
    ${renderSshRemoteStateMutationGuard({
      operation: "release",
      owner: input.owner,
      correlationId: input.correlationId,
    })}
    ${ash.raw(`
    cleanup_release_guard() { release_guard || true; }
    trap cleanup_release_guard EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    [ -d "$data_root" ] && [ ! -L "$data_root" ] || exit 75
    [ -d "$data_root/locks" ] && [ ! -L "$data_root/locks" ] || exit 75
    acquire_guard || exit $?
    if [ ! -e "$lock_dir" ] && [ ! -L "$lock_dir" ]; then exit 0; fi
    [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || exit 75
    if [ ! -e "$owner_file" ] && [ ! -L "$owner_file" ]; then exit 75; fi
    [ -f "$owner_file" ] && [ ! -L "$owner_file" ] || exit 75
    grep -F "$expected_lock_token_fragment" "$owner_file" >/dev/null 2>&1 || { cat "$owner_file" >&2; exit 75; }
    [ ! -e "$release_dir" ] && [ ! -L "$release_dir" ] || exit 75
    mv "$lock_dir" "$release_dir" || exit 75
    released_owner="$release_dir/owner.json"
    if [ -f "$released_owner" ] && [ ! -L "$released_owner" ] && grep -F "$expected_lock_token_fragment" "$released_owner" >/dev/null 2>&1; then
      rm -rf "$release_dir"
    else
      if [ ! -e "$lock_dir" ] && [ ! -L "$lock_dir" ]; then mv "$release_dir" "$lock_dir" 2>/dev/null || true; fi
      exit 75
    fi
    release_guard || exit $?
    trap - EXIT HUP INT TERM
    printf "released %s\\n" "$data_root"`)}
  `;
}

function phaseForPrepareFailure(result: SshRemoteCommandResult): string {
  if (result.exitCode === lockConflictExitCode || result.exitCode === lockOwnershipExitCode) {
    return "remote-state-lock";
  }

  if (result.exitCode === migrationFailureExitCode) {
    return "remote-state-migration";
  }

  if (result.exitCode === stateBackendMismatchExitCode) {
    return "server-state-backend";
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

function remoteStateResolutionError(
  message: string,
  details?: Record<string, string | number | boolean | null>,
): ReturnType<typeof domainError.infra> {
  return {
    ...retriableInfraError(message, details),
    knowledge: resolvePublicDocsErrorKnowledge("infra_error.remote-state-resolution"),
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
  private readonly readOnly: boolean;
  private readonly owner: string;
  private readonly correlationId: string;
  private readonly lockToken: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: SshRemoteCommandRunner;
  private readonly heartbeatIntervalMs: number | null;
  private readonly staleAfterMs: number;
  private readonly lockAcquireTimeoutMs: number;
  private readonly lockRetryIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatInFlight = false;
  private readonly heartbeatIdleWaiters: Array<() => void> = [];

  constructor(options: SshRemoteStateLifecycleOptions) {
    this.dataRoot = options.dataRoot;
    this.target = options.target;
    this.schemaVersion = options.schemaVersion ?? defaultSchemaVersion;
    this.readOnly = options.readOnly ?? false;
    this.owner = options.owner ?? "appaloft-cli";
    this.correlationId = options.correlationId ?? defaultCorrelationId("remote_state");
    this.lockToken = options.lockToken ?? `lifecycle-${randomUUID()}`;
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

    if (!this.readOnly) {
      this.startHeartbeat();
    }
    return ok({
      dataRoot: this.dataRoot,
      schemaVersion: this.schemaVersion,
      release: () => (this.readOnly ? Promise.resolve(ok(undefined)) : this.release()),
    });
  }

  private async acquireLockWithRetry(): Promise<Result<void>> {
    const deadline =
      this.lockAcquireTimeoutMs > 0 ? Date.now() + this.lockAcquireTimeoutMs : Date.now();
    const startedAt = Date.now();

    while (true) {
      const result = await this.runner.run({
        target: this.target,
        command: renderShLcCommand(
          remotePrepareCommand({
            dataRoot: this.dataRoot,
            schemaVersion: this.schemaVersion,
            owner: this.owner,
            correlationId: this.correlationId,
            lockToken: this.lockToken,
            staleAfterSeconds: Math.ceil(this.staleAfterMs / 1_000),
            readOnly: this.readOnly,
          }),
        ),
        cwd: this.cwd,
        env: this.env,
        redactions: this.target.identityFile ? [this.target.identityFile] : [],
      });

      if (!result.failed) {
        return ok(undefined);
      }

      const phase = phaseForPrepareFailure(result);
      if (phase === "server-state-backend") {
        const mismatch = parseStateBackendMismatch(result.stderr);
        return err(
          serverStateBackendMismatchError({
            expectedStateBackend: "ssh-pglite",
            actualStateBackend: mismatch?.actualStateBackend ?? "postgres-control-plane",
            phase,
            host: this.target.host,
            port: normalizePort(this.target.port),
            dataRoot: this.dataRoot,
          }),
        );
      }

      const error =
        phase === "remote-state-lock"
          ? remoteStateLockError(
              result.exitCode === lockConflictExitCode
                ? "SSH remote state mutation lock is already held"
                : "SSH remote state transition guard failed integrity or ownership validation",
              {
                ...errorDetails({
                  target: this.target,
                  phase,
                  exitCode: result.exitCode,
                  stderr: result.stderr,
                  ...(result.reason ? { reason: result.reason } : {}),
                }),
                retryAfterSeconds: Math.ceil(this.lockRetryIntervalMs / 1_000),
                lockAcquireTimeoutSeconds: Math.ceil(this.lockAcquireTimeoutMs / 1_000),
              },
            )
          : remoteStateResolutionError("SSH remote state could not be prepared", {
              ...errorDetails({
                target: this.target,
                phase,
                exitCode: result.exitCode,
                stderr: result.stderr,
                ...(result.reason ? { reason: result.reason } : {}),
              }),
            });

      if (result.exitCode !== lockConflictExitCode || Date.now() >= deadline) {
        return err(this.decorateLockTimeout(error, startedAt));
      }

      await sleep(Math.min(this.lockRetryIntervalMs, Math.max(0, deadline - Date.now())));
    }
  }

  private async release(): Promise<Result<void>> {
    this.stopHeartbeat();
    await this.waitForHeartbeatIdle();
    const result = await this.runner.run({
      target: this.target,
      command: renderShLcCommand(
        remoteReleaseCommand({
          dataRoot: this.dataRoot,
          owner: this.owner,
          correlationId: this.correlationId,
          lockToken: this.lockToken,
        }),
      ),
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

  private waitForHeartbeatIdle(): Promise<void> {
    if (!this.heartbeatInFlight) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.heartbeatIdleWaiters.push(resolve);
    });
  }

  private async refreshHeartbeat(): Promise<void> {
    if (this.heartbeatInFlight) {
      return;
    }
    this.heartbeatInFlight = true;
    try {
      const result = await this.runner.run({
        target: this.target,
        command: renderShLcCommand(
          remoteHeartbeatCommand({
            dataRoot: this.dataRoot,
            owner: this.owner,
            correlationId: this.correlationId,
            lockToken: this.lockToken,
            staleAfterSeconds: Math.ceil(this.staleAfterMs / 1_000),
          }),
        ),
        cwd: this.cwd,
        env: this.env,
        redactions: this.target.identityFile ? [this.target.identityFile] : [],
      });

      if (result.failed && result.exitCode === lockOwnershipExitCode) {
        this.stopHeartbeat();
      }
    } finally {
      this.heartbeatInFlight = false;
      for (const resolve of this.heartbeatIdleWaiters.splice(0)) {
        resolve();
      }
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
