import { type AshScript, ash } from "@appaloft/ash";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import { optionalValue, print, resultToEffect } from "../runtime.js";
import {
  buildSshRemoteStateProcessArgs,
  renderSshRemoteStateMutationGuard,
  type SshRemoteStateTarget,
} from "./deployment-ssh-remote-state.js";
import { cliCommandDescriptions } from "./docs-help.js";

const defaultRemoteRuntimeRoot = "/var/lib/appaloft/runtime";
const defaultLockStaleAfterSeconds = 20 * 60;

const serverHostOption = Options.text("server-host");
const serverPortOption = Options.text("server-port").pipe(Options.optional);
const serverSshUsernameOption = Options.text("server-ssh-username").pipe(Options.optional);
const serverSshPrivateKeyFileOption = Options.text("server-ssh-private-key-file").pipe(
  Options.optional,
);
const remoteRuntimeRootOption = Options.text("remote-runtime-root").pipe(
  Options.withDefault(defaultRemoteRuntimeRoot),
);
const staleAfterSecondsOption = Options.text("stale-after-seconds").pipe(
  Options.withDefault(String(defaultLockStaleAfterSeconds)),
);
const backupReferenceOption = Options.text("backup-reference");
const targetRemoteRuntimeRootOption = Options.text("target-remote-runtime-root");
const candidateRemoteRuntimeRootOption = Options.text("candidate-remote-runtime-root");
const candidatePlanDigestOption = Options.text("candidate-plan-digest");
const confirmOption = Options.boolean("confirm").pipe(Options.withDefault(false));

type RemoteStateLockStatus = Record<string, string | number | boolean | null>;

function safeOutput(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue.slice(0, 2_000) : undefined;
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

function parsePositiveInteger(label: string, value: string): Result<number> {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return ok(parsed);
  }

  return err(
    domainError.validation(`${label} must be a positive integer`, {
      phase: "remote-state-lock",
      stateBackend: "ssh-pglite",
    }),
  );
}

function remoteStateDataRoot(remoteRuntimeRoot: string): string {
  return `${remoteRuntimeRoot.replace(/\/+$/, "")}/state`;
}

function renderShLcCommand(script: AshScript): string {
  return ash.render(ash`sh -lc ${ash.arg(ash.render(script))}`).trim();
}

function targetFromOptions(input: {
  serverHost: string;
  serverPort?: string;
  serverSshUsername?: string;
  serverSshPrivateKeyFile?: string;
}): Result<SshRemoteStateTarget> {
  const host = input.serverHost.trim();
  if (!host) {
    return err(
      domainError.validation("SSH remote-state target host is required", {
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
      }),
    );
  }

  const portResult =
    input.serverPort === undefined
      ? ok(undefined)
      : parsePositiveInteger("SSH remote-state target port", input.serverPort);
  if (portResult.isErr()) {
    return err(portResult.error);
  }

  return ok({
    host,
    ...(portResult.value === undefined ? {} : { port: portResult.value }),
    ...(input.serverSshUsername?.trim() ? { username: input.serverSshUsername.trim() } : {}),
    ...(input.serverSshPrivateKeyFile?.trim()
      ? { identityFile: input.serverSshPrivateKeyFile.trim() }
      : {}),
  });
}

function targetFromCommandOptions(options: {
  serverHost: string;
  serverPort: ReturnType<typeof optionalValue<string>>;
  serverSshUsername: ReturnType<typeof optionalValue<string>>;
  serverSshPrivateKeyFile: ReturnType<typeof optionalValue<string>>;
}): Result<SshRemoteStateTarget> {
  return targetFromOptions({
    serverHost: options.serverHost,
    ...(options.serverPort ? { serverPort: options.serverPort } : {}),
    ...(options.serverSshUsername ? { serverSshUsername: options.serverSshUsername } : {}),
    ...(options.serverSshPrivateKeyFile
      ? { serverSshPrivateKeyFile: options.serverSshPrivateKeyFile }
      : {}),
  });
}

function parseRemoteStateLockStatus(stdout: string): RemoteStateLockStatus | string {
  const text = stdout.trim();
  if (!text.startsWith("{")) {
    return text;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return text;
    }

    const status: RemoteStateLockStatus = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        status[key] = value;
      }
    }
    return status;
  } catch {
    return text;
  }
}

function lockStatusShellPrelude(input: { dataRoot: string; staleAfterSeconds: number }): AshScript {
  return ash`
    set -eu
    ${ash.env("data_root", input.dataRoot)}
    ${ash.env("data_root_json", JSON.stringify(input.dataRoot))}
    ${ash.env("stale_after_seconds", input.staleAfterSeconds)}
    ${ash.raw(`lock_dir="$data_root/locks/mutation.lock"
    owner_file="$lock_dir/owner.json"
    json_string() { if [ "$#" -eq 0 ] || [ -z "$1" ]; then printf null; return; fi; printf '"' ; printf "%s" "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; printf '"' ; }
    json_number() { if [ -n "$1" ]; then printf "%s" "$1"; else printf null; fi; }
    now_epoch="$(date -u +%s 2>/dev/null || date +%s)"
    owner=""
    correlation_id=""
    started_at=""
    last_heartbeat=""
    recorded_stale_after=""
    heartbeat_epoch=""
    lock_age_seconds=""
    owner_file_present=false
    stale=false`)}
  `;
}

export function renderSshRemoteStateLockInspectScript(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
}): AshScript {
  const staleAfterSeconds = input.staleAfterSeconds ?? defaultLockStaleAfterSeconds;
  return ash`
    ${lockStatusShellPrelude({ dataRoot: input.dataRoot, staleAfterSeconds })}
    ${ash.raw(`if [ ! -d "$data_root" ]; then
      printf '{"status":"missing","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s}\\n' "$data_root_json"
      exit 0
    fi
    if [ ! -d "$lock_dir" ]; then
      printf '{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"stale":false}\\n' "$data_root_json"
      exit 0
    fi
    if [ -f "$owner_file" ]; then
      owner_file_present=true
      owner="$(sed -n 's/.*"owner"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      correlation_id="$(sed -n 's/.*"correlationId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      started_at="$(sed -n 's/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      last_heartbeat="$(sed -n 's/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      recorded_stale_after="$(sed -n 's/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$owner_file" | head -n 1 || true)"
    fi
    [ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"
    if [ "$recorded_stale_after" -gt "$stale_after_seconds" ]; then recorded_stale_after="$stale_after_seconds"; fi
    if [ "$owner_file_present" != true ] && [ "$recorded_stale_after" -gt 30 ]; then recorded_stale_after=30; fi
    [ -n "$last_heartbeat" ] || last_heartbeat="$started_at"
    if [ -n "$last_heartbeat" ]; then
      heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"
    fi
    if [ -z "$heartbeat_epoch" ]; then
      heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"
    fi
    if [ -n "$heartbeat_epoch" ]; then
      lock_age_seconds=$((now_epoch - heartbeat_epoch))
    fi
    if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then stale=true; fi
    status=active
    if [ "$stale" = true ]; then status=stale; fi
    printf '{"status":"%s","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"lockPath":%s,"owner":%s,"correlationId":%s,"startedAt":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"stale":%s}\\n' "$status" "$data_root_json" "$(json_string "$lock_dir")" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$started_at")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")" "$stale"`)}
  `;
}

export function buildSshRemoteStateLockInspectCommand(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
}): string {
  return renderShLcCommand(renderSshRemoteStateLockInspectScript(input));
}

export function renderSshRemoteStateLockRecoverStaleScript(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
  recoveredBy?: string;
}): AshScript {
  const staleAfterSeconds = input.staleAfterSeconds ?? defaultLockStaleAfterSeconds;
  const recoveredBy = input.recoveredBy ?? "appaloft-cli";
  return ash`
    ${lockStatusShellPrelude({ dataRoot: input.dataRoot, staleAfterSeconds })}
    ${ash.env("recovered_by", recoveredBy)}
    ${ash.raw(`if [ ! -e "$data_root" ] && [ ! -L "$data_root" ]; then
      printf '{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":false}\\n' "$data_root_json"
      exit 0
    fi
    [ -d "$data_root" ] && [ ! -L "$data_root" ] || exit 75
    if [ ! -e "$data_root/locks" ] && [ ! -L "$data_root/locks" ]; then
      printf '{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":false}\\n' "$data_root_json"
      exit 0
    fi
    [ -d "$data_root/locks" ] && [ ! -L "$data_root/locks" ] || exit 75`)}
    ${renderSshRemoteStateMutationGuard({
      operation: "recover-stale",
      owner: recoveredBy,
      correlationId: "remote-state-lock-recover-stale",
    })}
    ${ash.raw(`cleanup_recover_guard() { release_guard || true; }
    trap cleanup_recover_guard EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    acquire_guard || exit $?
    now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
    if [ ! -e "$lock_dir" ] && [ ! -L "$lock_dir" ]; then
      release_guard || exit $?
      trap - EXIT HUP INT TERM
      printf '{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":false}\\n' "$data_root_json"
      exit 0
    fi
    [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || exit 75
    if [ -e "$owner_file" ] || [ -L "$owner_file" ]; then
      [ -f "$owner_file" ] && [ ! -L "$owner_file" ] || exit 75
    fi
    if [ -f "$owner_file" ]; then
      owner_file_present=true
      owner="$(sed -n 's/.*"owner"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      correlation_id="$(sed -n 's/.*"correlationId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      started_at="$(sed -n 's/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      last_heartbeat="$(sed -n 's/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
      recorded_stale_after="$(sed -n 's/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$owner_file" | head -n 1 || true)"
    fi
    [ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"
    if [ "$recorded_stale_after" -gt "$stale_after_seconds" ]; then recorded_stale_after="$stale_after_seconds"; fi
    if [ "$owner_file_present" != true ] && [ "$recorded_stale_after" -gt 30 ]; then recorded_stale_after=30; fi
    [ -n "$last_heartbeat" ] || last_heartbeat="$started_at"
    if [ -n "$last_heartbeat" ]; then
      heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"
    fi
    if [ -z "$heartbeat_epoch" ]; then
      heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"
    fi
    if [ -n "$heartbeat_epoch" ]; then
      lock_age_seconds=$((now_epoch - heartbeat_epoch))
    fi
    if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then stale=true; fi
    if [ "$stale" != true ]; then
      release_guard || exit $?
      trap - EXIT HUP INT TERM
      printf '{"status":"active","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"owner":%s,"correlationId":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"recovered":false,"stale":false}\\n' "$data_root_json" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")"
      exit 0
    fi
    recovered_dir="$data_root/locks/recovered"
    if [ -e "$recovered_dir" ] || [ -L "$recovered_dir" ]; then
      [ -d "$recovered_dir" ] && [ ! -L "$recovered_dir" ] || exit 75
    else
      mkdir "$recovered_dir"
    fi
    recovered_path="$recovered_dir/manual-$stamp-$$.lock"
    recovery_record_temp="$recovered_dir/.manual-$stamp-$$.recovered.json"
    [ ! -e "$recovered_path" ] && [ ! -L "$recovered_path" ] || exit 75
    [ ! -e "$recovery_record_temp" ] && [ ! -L "$recovery_record_temp" ] || exit 75
    printf '{"phase":"remote-state-lock","status":"planned","recoveredAt":"%s","recoveredBy":%s,"owner":%s,"correlationId":%s,"lockAgeSeconds":%s}\\n' "$now" "$(json_string "$recovered_by")" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_number "$lock_age_seconds")" > "$recovery_record_temp"
    guard_sync_path "$recovery_record_temp" || exit 75
    guard_sync_path "$recovered_dir" || exit 75
    recovery_move_error=""
    if recovery_move_error="$(mv "$lock_dir" "$recovered_path" 2>&1)"; then
      mv "$recovery_record_temp" "$recovered_path/recovered.json"
      guard_sync_path "$recovered_dir" || exit 75
      release_guard || exit $?
      trap - EXIT HUP INT TERM
      printf '{"status":"recovered","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"owner":%s,"correlationId":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"recovered":true,"recoveredPath":%s,"stale":true}\\n' "$data_root_json" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")" "$(json_string "$recovered_path")"
    else
      rm -f "$recovery_record_temp"
      [ -z "$recovery_move_error" ] || printf '%s\\n' "$recovery_move_error" >&2
      release_guard || exit $?
      trap - EXIT HUP INT TERM
      exit 75
    fi`)}
  `;
}

export function buildSshRemoteStateLockRecoverStaleCommand(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
  recoveredBy?: string;
}): string {
  return renderShLcCommand(renderSshRemoteStateLockRecoverStaleScript(input));
}

export function renderSshRemoteStateDiagnosticsScript(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
  limit?: number;
}): AshScript {
  const staleAfterSeconds = input.staleAfterSeconds ?? defaultLockStaleAfterSeconds;
  const limit = input.limit ?? 50;
  return ash`
    ${lockStatusShellPrelude({ dataRoot: input.dataRoot, staleAfterSeconds })}
    ${ash.env("limit", limit)}
    ${ash.raw(`emit_file() { [ -f "$1" ] || return 0; phase="$2"; step="$3"; marker_id="$4"; updated_at="$(stat -c %y "$1" 2>/dev/null || stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%SZ" "$1" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"; printf '{"id":%s,"status":"succeeded","phase":"%s","step":"%s","updatedAt":%s,"stateBackend":"ssh-pglite"}\\n' "$(json_string "$marker_id")" "$phase" "$step" "$(json_string "$updated_at")"; }
    if [ ! -d "$data_root" ]; then
      printf '{"id":"state-root","status":"failed","phase":"remote-state-recovery","step":"missing","updatedAt":%s,"stateBackend":"ssh-pglite","dataRoot":%s,"errorCode":"remote_state_root_missing","errorCategory":"infra","retriable":true}\\n' "$(json_string "$(date -u +"%Y-%m-%dT%H:%M:%SZ")")" "$data_root_json"
      exit 0
    fi
    if [ -d "$lock_dir" ]; then
      if [ -f "$owner_file" ]; then
        owner_file_present=true
        owner="$(sed -n 's/.*"owner"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
        correlation_id="$(sed -n 's/.*"correlationId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
        started_at="$(sed -n 's/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
        last_heartbeat="$(sed -n 's/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$owner_file" | head -n 1 || true)"
        recorded_stale_after="$(sed -n 's/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$owner_file" | head -n 1 || true)"
      fi
      [ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"
      if [ "$recorded_stale_after" -gt "$stale_after_seconds" ]; then recorded_stale_after="$stale_after_seconds"; fi
      if [ "$owner_file_present" != true ] && [ "$recorded_stale_after" -gt 30 ]; then recorded_stale_after=30; fi
      [ -n "$last_heartbeat" ] || last_heartbeat="$started_at"
      if [ -n "$last_heartbeat" ]; then heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"; fi
      if [ -z "$heartbeat_epoch" ]; then heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"; fi
      if [ -n "$heartbeat_epoch" ]; then lock_age_seconds=$((now_epoch - heartbeat_epoch)); fi
      if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then stale=true; fi
      status=running; step=active; error_code=; retriable=false; next_action=no-action
      if [ "$stale" = true ]; then status=failed; step=stale; error_code=remote_state_lock_stale; retriable=true; next_action=manual-review; fi
      updated_at="$last_heartbeat"; [ -n "$updated_at" ] || updated_at="$started_at"
      printf '{"id":"mutation-lock","status":"%s","phase":"remote-state-lock","step":"%s","updatedAt":%s,"stateBackend":"ssh-pglite","dataRoot":%s,"lockPath":%s,"owner":%s,"correlationId":%s,"startedAt":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"stale":%s,"retriable":%s,"nextAction":"%s"' "$status" "$step" "$(json_string "$updated_at")" "$data_root_json" "$(json_string "$lock_dir")" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$started_at")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")" "$stale" "$retriable" "$next_action"
      if [ -n "$error_code" ]; then printf ',"errorCode":"%s","errorCategory":"infra"' "$error_code"; fi
      printf '}\\n'
    else
      printf '{"id":"mutation-lock","status":"succeeded","phase":"remote-state-lock","step":"unlocked","updatedAt":%s,"stateBackend":"ssh-pglite","dataRoot":%s,"stale":false}\\n' "$(json_string "$(date -u +"%Y-%m-%dT%H:%M:%SZ")")" "$data_root_json"
    fi
    count=0; for file in "$data_root"/journals/*.json; do [ "$count" -lt "$limit" ] || break; [ -f "$file" ] || continue; emit_file "$file" "remote-state-migration" "journal" "migration:$(basename "$file" .json)"; count=$((count + 1)); done
    count=0; for file in "$data_root"/backups/*; do [ "$count" -lt "$limit" ] || break; [ -e "$file" ] || continue; emit_file "$file" "remote-state-backup" "backup" "backup:$(basename "$file")"; count=$((count + 1)); done
    count=0; for file in "$data_root"/recovery/*.json "$data_root"/locks/recovered/*/recovered.json; do [ "$count" -lt "$limit" ] || break; [ -f "$file" ] || continue; emit_file "$file" "remote-state-recovery" "marker" "recovery:$(basename "$(dirname "$file")")-$(basename "$file" .json)"; count=$((count + 1)); done`)}
  `;
}

export function buildSshRemoteStateDiagnosticsCommand(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
  limit?: number;
}): string {
  return renderShLcCommand(renderSshRemoteStateDiagnosticsScript(input));
}

function remoteStateMaintenancePrelude(input: {
  dataRoot: string;
  owner: string;
  correlationId: string;
}): AshScript {
  return ash`
    set -eu
    ${ash.env("data_root", input.dataRoot)}
    ${ash.env("owner", input.owner)}
    ${ash.env("correlation_id", input.correlationId)}
    ${ash.raw(`json_string() { if [ "$#" -eq 0 ] || [ -z "$1" ]; then printf null; return; fi; printf '"'; printf "%s" "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; printf '"'; }
    sha256_file() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
    sha256_stream() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'; else shasum -a 256 | awk '{print $1}'; fi; }
    state_tree_digest() { tar -cf - -C "$1" pglite source-links server-applied-routes | sha256_stream; }
    sync_path() { sync "$1" 2>/dev/null || sync; }
    sync_all() { sync; }
    ensure_real_directory_path() {
      real_base="$1"
      real_target="$2"
      real_mode="$3"
      [ -d "$real_base" ] && [ ! -L "$real_base" ] || return 75
      case "$real_target" in "$real_base"/*) ;; *) return 75 ;; esac
      real_relative="\${real_target#"$real_base"/}"
      [ -n "$real_relative" ] || return 75
      real_current="$real_base"
      while [ -n "$real_relative" ]; do
        case "$real_relative" in
          */*) real_component="\${real_relative%%/*}"; real_relative="\${real_relative#*/}" ;;
          *) real_component="$real_relative"; real_relative="" ;;
        esac
        case "$real_component" in ''|.|..) return 75 ;; esac
        real_current="$real_current/$real_component"
        if [ -e "$real_current" ] || [ -L "$real_current" ]; then
          [ -d "$real_current" ] && [ ! -L "$real_current" ] || return 75
        elif [ "$real_mode" = create ]; then
          mkdir "$real_current" || return 75
        else
          return 75
        fi
      done
    }
    [ -d "$data_root" ] && [ ! -L "$data_root" ] || { echo "remote state root is unavailable" >&2; exit 1; }
    for maintenance_dir in "$data_root/locks" "$data_root/backups" "$data_root/recovery"; do
      if [ -e "$maintenance_dir" ] || [ -L "$maintenance_dir" ]; then
        [ -d "$maintenance_dir" ] && [ ! -L "$maintenance_dir" ] || { echo "remote maintenance path is not a real directory" >&2; exit 1; }
      else
        mkdir "$maintenance_dir"
      fi
    done
    lock_dir="$data_root/locks/mutation.lock"
    owner_file="$lock_dir/owner.json"
    lock_token=""
    lock_token_fragment=""
    lock_acquired=false
    maintenance_owner_written=false
    heartbeat_pid=""
    maintenance_main_pid="$$"
    maintenance_operation_cleanup() { return 0; }`)}
    ${renderSshRemoteStateMutationGuard({
      operation: "maintenance",
      owner: input.owner,
      correlationId: input.correlationId,
    })}
    ${ash.raw(`
    release_maintenance_lock() {
      [ "$lock_acquired" = true ] || return 0
      if [ "$guard_owned" != true ]; then acquire_guard || return $?; fi
      [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || return 75
      if [ "$maintenance_owner_written" != true ]; then
        maintenance_release_dir="$data_root/locks/.mutation-maintenance-ownerless-$lock_token"
        [ ! -e "$maintenance_release_dir" ] && [ ! -L "$maintenance_release_dir" ] || return 75
        mv "$lock_dir" "$maintenance_release_dir" || return 75
        rm -rf "$maintenance_release_dir" || return 75
        lock_acquired=false
        release_guard
        return $?
      fi
      [ -f "$owner_file" ] && [ ! -L "$owner_file" ] || return 75
      grep -F "$lock_token_fragment" "$owner_file" >/dev/null 2>&1 || return 75
      maintenance_release_dir="$data_root/locks/.mutation-maintenance-release-$lock_token"
      [ ! -e "$maintenance_release_dir" ] && [ ! -L "$maintenance_release_dir" ] || return 75
      mv "$lock_dir" "$maintenance_release_dir" || return 75
      maintenance_released_owner="$maintenance_release_dir/owner.json"
      if [ -f "$maintenance_released_owner" ] && [ ! -L "$maintenance_released_owner" ] && grep -F "$lock_token_fragment" "$maintenance_released_owner" >/dev/null 2>&1; then
        rm -rf "$maintenance_release_dir" || return 75
        lock_acquired=false
      else
        if [ ! -e "$lock_dir" ] && [ ! -L "$lock_dir" ]; then mv "$maintenance_release_dir" "$lock_dir" 2>/dev/null || true; fi
        return 75
      fi
      release_guard
    }
    cleanup_maintenance_lock() { status=$?; operation_cleanup_status=0; release_status=0; trap - EXIT HUP INT TERM; maintenance_operation_cleanup "$status" || operation_cleanup_status=$?; if [ -n "$heartbeat_pid" ]; then kill "$heartbeat_pid" 2>/dev/null || true; wait "$heartbeat_pid" 2>/dev/null || true; fi; release_maintenance_lock || release_status=$?; if ! release_guard; then [ "$release_status" -ne 0 ] || release_status=75; fi; if [ "$status" -eq 0 ] && [ "$operation_cleanup_status" -ne 0 ]; then status="$operation_cleanup_status"; fi; if [ "$status" -eq 0 ] && [ "$release_status" -ne 0 ]; then status="$release_status"; fi; exit "$status"; }
    trap cleanup_maintenance_lock EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    acquire_guard || exit $?
    lock_token="maintenance-$guard_uuid"
    lock_token_fragment="$(printf '"lockToken":"%s"' "$lock_token")"
    if [ -e "$lock_dir" ] || [ -L "$lock_dir" ]; then
      [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || exit 75
      if [ -f "$owner_file" ] && [ ! -L "$owner_file" ]; then cat "$owner_file" >&2; fi
      release_guard || exit $?
      exit 73
    fi
    mkdir "$lock_dir"
    lock_acquired=true
    now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    maintenance_owner_temp="$lock_dir/.owner-maintenance-$$.tmp"
    printf '{"owner":%s,"correlationId":%s,"lockToken":"%s","startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":1200}\n' "$(json_string "$owner")" "$(json_string "$correlation_id")" "$lock_token" "$now" "$now" > "$maintenance_owner_temp"
    mv "$maintenance_owner_temp" "$owner_file"
    maintenance_owner_written=true
    release_guard || exit $?
    recover_planned_state_swap() {
      pending_recovery_file="$1"
      [ -e "$pending_recovery_file" ] || [ -L "$pending_recovery_file" ] || return 0
      [ -f "$pending_recovery_file" ] && [ ! -L "$pending_recovery_file" ] || return 75
      pending_status="$(sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      [ "$pending_status" = planned ] || return 0
      pending_operation="$(sed -n 's/.*"operation"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      pending_transaction_id="$(sed -n 's/.*"transactionId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      pending_rollback_name="$(sed -n 's/.*"rollbackDirName"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      pending_incoming_name="$(sed -n 's/.*"incomingName"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      pending_revision_temp_name="$(sed -n 's/.*"revisionTempName"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      pending_expected_revision="$(sed -n 's/.*"expectedRevision"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      pending_next_revision="$(sed -n 's/.*"nextRevision"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$pending_recovery_file" | head -n 1 || true)"
      case "$pending_operation" in promotion|rollback) ;; *) return 75 ;; esac
      case "$pending_transaction_id" in ''|*[!A-Za-z0-9-]*) return 75 ;; esac
      case "$pending_transaction_id" in "$pending_operation"-*) ;; *) return 75 ;; esac
      [ "$pending_rollback_name" = "replaced-$pending_transaction_id" ] || return 75
      [ "$pending_incoming_name" = ".incoming-recovery-$pending_transaction_id" ] || return 75
      [ "$pending_revision_temp_name" = ".sync-revision-$pending_transaction_id.tmp" ] || return 75
      case "$pending_expected_revision" in ''|*[!0-9]*) return 75 ;; esac
      case "$pending_next_revision" in ''|*[!0-9]*) return 75 ;; esac
      [ "$pending_next_revision" -eq $((pending_expected_revision + 1)) ] || return 75
      pending_rollback_dir="$data_root/backups/$pending_rollback_name"
      pending_incoming="$data_root/$pending_incoming_name"
      pending_revision_temp="$data_root/$pending_revision_temp_name"
      [ -d "$pending_rollback_dir" ] && [ ! -L "$pending_rollback_dir" ] || return 75
      if [ -e "$pending_incoming" ] || [ -L "$pending_incoming" ]; then [ -d "$pending_incoming" ] && [ ! -L "$pending_incoming" ] || return 75; fi
      if [ -e "$pending_revision_temp" ] || [ -L "$pending_revision_temp" ]; then [ -f "$pending_revision_temp" ] && [ ! -L "$pending_revision_temp" ] || return 75; fi
      pending_actual_revision=0
      if [ -e "$data_root/sync-revision.txt" ] || [ -L "$data_root/sync-revision.txt" ]; then
        [ -f "$data_root/sync-revision.txt" ] && [ ! -L "$data_root/sync-revision.txt" ] || return 75
        pending_actual_revision="$(cat "$data_root/sync-revision.txt" 2>/dev/null || printf invalid)"
      fi
      case "$pending_actual_revision" in ''|*[!0-9]*) return 75 ;; esac
      pending_resolution=""
      if [ "$pending_actual_revision" = "$pending_expected_revision" ]; then
        for pending_component in pglite source-links server-applied-routes; do
          pending_rollback_component="$pending_rollback_dir/$pending_component"
          pending_live_component="$data_root/$pending_component"
          [ ! -L "$pending_rollback_component" ] && [ ! -L "$pending_live_component" ] || return 75
          if [ -d "$pending_rollback_component" ]; then
            rm -rf "$pending_live_component" || return 75
            mv "$pending_rollback_component" "$pending_live_component" || return 75
          else
            [ -d "$pending_live_component" ] || return 75
          fi
        done
        rm -rf "$pending_incoming" || return 75
        rm -f "$pending_revision_temp" || return 75
        sync_path "$data_root" || return 75
        pending_resolution="recovered-rolled-back"
      elif [ "$pending_actual_revision" = "$pending_next_revision" ]; then
        rm -rf "$pending_incoming" || return 75
        rm -f "$pending_revision_temp" || return 75
        sync_path "$data_root" || return 75
        pending_resolution="recovered-committed"
      else
        return 75
      fi
      pending_recovery_temp="$data_root/recovery/.remote-state-$pending_transaction_id-recovered.tmp"
      [ ! -e "$pending_recovery_temp" ] && [ ! -L "$pending_recovery_temp" ] || return 75
      printf '{"schemaVersion":"appaloft.remote-state-swap-recovery/v1","status":"%s","operation":"%s","transactionId":"%s","expectedRevision":%s,"nextRevision":%s,"actualRevision":%s,"recordedAt":"%s"}\n' "$pending_resolution" "$pending_operation" "$pending_transaction_id" "$pending_expected_revision" "$pending_next_revision" "$pending_actual_revision" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$pending_recovery_temp" || return 75
      sync_path "$pending_recovery_temp" || return 75
      mv "$pending_recovery_temp" "$pending_recovery_file" || return 75
      sync_path "$data_root/recovery" || return 75
    }
    recover_planned_state_swap "$data_root/recovery/remote-state-promotion.json" || exit $?
    recover_planned_state_swap "$data_root/recovery/remote-state-rollback.json" || exit $?
    [ -d "$data_root/pglite" ] && [ ! -L "$data_root/pglite" ] || { echo "remote PGlite state is unavailable" >&2; exit 1; }
    [ -d "$data_root/source-links" ] && [ ! -L "$data_root/source-links" ] || { echo "remote source-link state is unavailable" >&2; exit 1; }
    [ -d "$data_root/server-applied-routes" ] && [ ! -L "$data_root/server-applied-routes" ] || { echo "remote route state is unavailable" >&2; exit 1; }
    maintenance_heartbeat() {
      heartbeat_sleep_pid=""
      trap '[ -z "$heartbeat_sleep_pid" ] || kill "$heartbeat_sleep_pid" 2>/dev/null || true; exit 0' HUP INT TERM
      maintenance_heartbeat_abort() { heartbeat_status="$1"; kill -TERM "$maintenance_main_pid" 2>/dev/null || true; exit "$heartbeat_status"; }
      while :; do
        sleep 15 &
        heartbeat_sleep_pid=$!
        wait "$heartbeat_sleep_pid" || exit
        heartbeat_sleep_pid=""
        heartbeat_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        heartbeat_tmp="$lock_dir/.owner-maintenance-heartbeat-$$.tmp"
        if acquire_guard; then
          :
        else
          heartbeat_guard_status=$?
          if [ "$heartbeat_guard_status" -eq 73 ]; then continue; fi
          maintenance_heartbeat_abort "$heartbeat_guard_status"
        fi
        if [ ! -d "$lock_dir" ] || [ -L "$lock_dir" ] || [ ! -f "$owner_file" ] || [ -L "$owner_file" ] || ! grep -F "$lock_token_fragment" "$owner_file" >/dev/null 2>&1; then release_guard || true; maintenance_heartbeat_abort 75; fi
        printf '{"owner":%s,"correlationId":%s,"lockToken":"%s","startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":1200}\n' "$(json_string "$owner")" "$(json_string "$correlation_id")" "$lock_token" "$now" "$heartbeat_at" > "$heartbeat_tmp" || { release_guard || true; maintenance_heartbeat_abort 75; }
        if [ ! -f "$owner_file" ] || [ -L "$owner_file" ] || ! grep -F "$lock_token_fragment" "$owner_file" >/dev/null 2>&1; then rm -f "$heartbeat_tmp"; release_guard || true; maintenance_heartbeat_abort 75; fi
        mv "$heartbeat_tmp" "$owner_file" || { rm -f "$heartbeat_tmp"; release_guard || true; maintenance_heartbeat_abort 75; }
        release_guard || maintenance_heartbeat_abort 75
      done
    }
    maintenance_heartbeat &
    heartbeat_pid=$!`)}
  `;
}

function immutableBackupReferencePrelude(reference: string): AshScript {
  return ash`
    ${ash.env("backup_reference", reference)}
    ${ash.raw(`case "$backup_reference" in remote-state-backup:immutable-[A-Za-z0-9._-]*) ;; *) echo "invalid immutable backup reference" >&2; exit 2 ;; esac
    backup_id="\${backup_reference#remote-state-backup:}"
    case "$backup_id" in *[!A-Za-z0-9._-]*|'') echo "invalid immutable backup id" >&2; exit 2 ;; esac
    backup_root="$data_root/backups/$backup_id"
    archive="$backup_root/state.tar.gz"
    manifest="$backup_root/manifest.json"
    [ -d "$backup_root" ] && [ ! -L "$backup_root" ] || { echo "immutable backup root is unavailable" >&2; exit 2; }
    [ -f "$archive" ] && [ ! -L "$archive" ] && [ -f "$manifest" ] && [ ! -L "$manifest" ] || { echo "immutable backup is unavailable" >&2; exit 2; }
    expected_archive_digest="$(sed -n 's/.*"archiveDigest"[[:space:]]*:[[:space:]]*"sha256:\\([0-9a-f][0-9a-f]*\\)".*/\\1/p' "$manifest" | head -n 1)"
    expected_source_digest="$(sed -n 's/.*"sourceTreeDigest"[[:space:]]*:[[:space:]]*"sha256:\\([0-9a-f][0-9a-f]*\\)".*/\\1/p' "$manifest" | head -n 1)"
    [ "\${#expected_archive_digest}" -eq 64 ] && [ "\${#expected_source_digest}" -eq 64 ] || { echo "immutable backup manifest is invalid" >&2; exit 2; }
    actual_archive_digest="$(sha256_file "$archive")"
    [ "$actual_archive_digest" = "$expected_archive_digest" ] || { echo "immutable backup digest mismatch" >&2; exit 2; }`)}
  `;
}

export function renderSshRemoteStateImmutableBackupCreateScript(input: {
  dataRoot: string;
  owner?: string;
  correlationId?: string;
}): AshScript {
  return ash`
    ${remoteStateMaintenancePrelude({
      dataRoot: input.dataRoot,
      owner: input.owner ?? "appaloft-cli-backup",
      correlationId: input.correlationId ?? "remote_state_backup",
    })}
    ${ash.raw(`stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
    backup_id="immutable-$stamp-$$"
    incoming="$data_root/backups/.incoming-$backup_id"
    backup_root="$data_root/backups/$backup_id"
    archive="$incoming/state.tar.gz"
    manifest="$incoming/manifest.json"
    rm -rf "$incoming"
    mkdir -p "$incoming"
    source_tree_digest="$(state_tree_digest "$data_root")"
    revision_file="$data_root/sync-revision.txt"
    if [ -e "$revision_file" ] || [ -L "$revision_file" ]; then [ -f "$revision_file" ] && [ ! -L "$revision_file" ] || { echo "remote revision is not a real file" >&2; exit 2; }; fi
    revision="$(cat "$revision_file" 2>/dev/null || printf 0)"
    case "$revision" in ''|*[!0-9]*) revision=0 ;; esac
    pg_version_file="$data_root/pglite/PG_VERSION"
    [ -f "$pg_version_file" ] && [ ! -L "$pg_version_file" ] || { echo "remote PGlite PostgreSQL version is not a real file" >&2; exit 2; }
    pg_major="$(cat "$pg_version_file" 2>/dev/null || true)"
    case "$pg_major" in ''|*[!0-9]*) echo "remote PGlite PostgreSQL major is invalid" >&2; exit 2 ;; esac
    tar -czf "$archive" -C "$data_root" pglite source-links server-applied-routes
    archive_digest="$(sha256_file "$archive")"
    archive_size="$(wc -c < "$archive" | tr -d ' ')"
    for marker in schema-version.json server-state-backend.json sync-revision.txt; do
      marker_path="$data_root/$marker"
      if [ -e "$marker_path" ] || [ -L "$marker_path" ]; then
        [ -f "$marker_path" ] && [ ! -L "$marker_path" ] || { echo "remote state marker is not a real file" >&2; exit 2; }
        cp -p "$marker_path" "$incoming/$marker"
      fi
    done
    printf '{"schemaVersion":"appaloft.remote-state-backup/v1","reference":"remote-state-backup:%s","createdAt":"%s","archiveDigest":"sha256:%s","sourceTreeDigest":"sha256:%s","archiveSizeBytes":%s,"sourceRevision":%s,"postgresMajor":"%s"}\n' "$backup_id" "$now" "$archive_digest" "$source_tree_digest" "$archive_size" "$revision" "$pg_major" > "$manifest"
    chmod 0440 "$incoming"/*
    chmod 0550 "$incoming"
    mv "$incoming" "$backup_root"
    printf '{"status":"created","phase":"remote-state-backup","stateBackend":"ssh-pglite","backupReference":"remote-state-backup:%s","archiveDigest":"sha256:%s","sourceTreeDigest":"sha256:%s","archiveSizeBytes":%s,"sourceRevision":%s,"postgresMajor":"%s"}\n' "$backup_id" "$archive_digest" "$source_tree_digest" "$archive_size" "$revision" "$pg_major"`)}
  `;
}

export function buildSshRemoteStateImmutableBackupCreateCommand(input: {
  dataRoot: string;
  owner?: string;
  correlationId?: string;
}): string {
  return renderShLcCommand(renderSshRemoteStateImmutableBackupCreateScript(input));
}

export function renderSshRemoteStateRestoreCopyScript(input: {
  dataRoot: string;
  backupReference: string;
  targetRemoteRuntimeRoot: string;
}): AshScript {
  return ash`
    ${remoteStateMaintenancePrelude({
      dataRoot: input.dataRoot,
      owner: "appaloft-cli-restore-copy",
      correlationId: "remote_state_restore_copy",
    })}
    ${immutableBackupReferencePrelude(input.backupReference)}
    ${ash.env("target_runtime_root", input.targetRemoteRuntimeRoot.replace(/\/+$/, ""))}
    ${ash.raw(`source_runtime_root="\${data_root%/state}"
    runtime_parent="\${source_runtime_root%/*}"
    [ -n "$target_runtime_root" ] && [ "$target_runtime_root" != "/" ] && [ "$target_runtime_root" != "$source_runtime_root" ] || { echo "candidate runtime root must be distinct" >&2; exit 2; }
    case "$target_runtime_root" in "$runtime_parent"/recovery/*) ;; *) echo "candidate runtime root must be under the recovery directory" >&2; exit 2 ;; esac
    [ -d "$runtime_parent" ] && [ ! -L "$runtime_parent" ] || { echo "candidate runtime parent is not a real directory" >&2; exit 2; }
    recovery_runtime_root="$runtime_parent/recovery"
    if [ -e "$recovery_runtime_root" ] || [ -L "$recovery_runtime_root" ]; then
      [ -d "$recovery_runtime_root" ] && [ ! -L "$recovery_runtime_root" ] || { echo "candidate recovery root is not a real directory" >&2; exit 2; }
    else
      mkdir "$recovery_runtime_root"
    fi
    ensure_real_directory_path "$recovery_runtime_root" "$target_runtime_root" create || { echo "candidate runtime path is not a real directory chain" >&2; exit 2; }
    target_state="$target_runtime_root/state"
    [ ! -e "$target_state" ] && [ ! -L "$target_state" ] || { echo "candidate state root already exists" >&2; exit 2; }
    incoming="$target_runtime_root/.incoming-state-$$"
    [ ! -e "$incoming" ] && [ ! -L "$incoming" ] || { echo "candidate incoming path already exists" >&2; exit 2; }
    mkdir "$incoming"
    tar -xzf "$archive" -C "$incoming"
    [ -d "$incoming/pglite" ] && [ ! -L "$incoming/pglite" ] && [ -f "$incoming/pglite/PG_VERSION" ] && [ ! -L "$incoming/pglite/PG_VERSION" ] && [ -d "$incoming/source-links" ] && [ ! -L "$incoming/source-links" ] && [ -d "$incoming/server-applied-routes" ] && [ ! -L "$incoming/server-applied-routes" ] || { echo "candidate archive contents are invalid" >&2; exit 2; }
    mkdir -p "$incoming/locks/recovered" "$incoming/backups" "$incoming/journals" "$incoming/recovery"
    for marker in schema-version.json server-state-backend.json sync-revision.txt; do
      marker_path="$backup_root/$marker"
      if [ -e "$marker_path" ] || [ -L "$marker_path" ]; then
        [ -f "$marker_path" ] && [ ! -L "$marker_path" ] || { echo "immutable backup marker is not a real file" >&2; exit 2; }
        cp -p "$marker_path" "$incoming/$marker"
        chmod 0640 "$incoming/$marker"
      fi
    done
    mv "$incoming" "$target_state"
    candidate_digest="$(state_tree_digest "$target_state")"
    [ "$candidate_digest" = "$expected_source_digest" ] || { rm -rf "$target_state"; echo "candidate source digest mismatch" >&2; exit 2; }
    printf '{"status":"restored-copy","phase":"remote-state-recovery","stateBackend":"ssh-pglite","backupReference":%s,"candidateRuntimeRoot":%s,"candidateTreeDigest":"sha256:%s"}\n' "$(json_string "$backup_reference")" "$(json_string "$target_runtime_root")" "$candidate_digest"`)}
  `;
}

export function buildSshRemoteStateRestoreCopyCommand(input: {
  dataRoot: string;
  backupReference: string;
  targetRemoteRuntimeRoot: string;
}): string {
  return renderShLcCommand(renderSshRemoteStateRestoreCopyScript(input));
}

function stagedStateSwapScript(input: { source: "candidate" | "backup" }): AshScript {
  const operation = input.source === "candidate" ? "promotion" : "rollback";
  const sourcePreparation =
    input.source === "candidate"
      ? ash`
          ${ash.raw(`candidate_state="$candidate_runtime_root/state"
          [ -d "$candidate_state" ] && [ ! -L "$candidate_state" ] && [ -d "$candidate_state/pglite" ] && [ ! -L "$candidate_state/pglite" ] && [ -f "$candidate_state/pglite/PG_VERSION" ] && [ ! -L "$candidate_state/pglite/PG_VERSION" ] && [ -d "$candidate_state/source-links" ] && [ ! -L "$candidate_state/source-links" ] && [ -d "$candidate_state/server-applied-routes" ] && [ ! -L "$candidate_state/server-applied-routes" ] || { echo "candidate state is invalid" >&2; exit 2; }
          cp -a "$candidate_state/pglite" "$incoming/pglite"
          cp -a "$candidate_state/source-links" "$incoming/source-links"
          cp -a "$candidate_state/server-applied-routes" "$incoming/server-applied-routes"`)}
        `
      : ash`
          ${ash.raw(`tar -xzf "$archive" -C "$incoming"
          [ -d "$incoming/pglite" ] && [ ! -L "$incoming/pglite" ] && [ -f "$incoming/pglite/PG_VERSION" ] && [ ! -L "$incoming/pglite/PG_VERSION" ] && [ -d "$incoming/source-links" ] && [ ! -L "$incoming/source-links" ] && [ -d "$incoming/server-applied-routes" ] && [ ! -L "$incoming/server-applied-routes" ] || { echo "backup contents are invalid" >&2; exit 2; }`)}
        `;

  return ash`
    ${ash.env("swap_operation", operation)}
    ${ash.raw(`transaction_id="$swap_operation-$(date -u +"%Y%m%dT%H%M%SZ")-$$"
    incoming_name=".incoming-recovery-$transaction_id"
    rollback_name="replaced-$transaction_id"
    revision_temp_name=".sync-revision-$transaction_id.tmp"
    incoming="$data_root/$incoming_name"
    rollback_dir="$data_root/backups/$rollback_name"
    recovery_file="$data_root/recovery/remote-state-$swap_operation.json"
    recovery_temp="$data_root/recovery/.remote-state-$transaction_id.tmp"
    revision_file="$data_root/sync-revision.txt"
    revision_temp="$data_root/$revision_temp_name"
    for generated_path in "$incoming" "$rollback_dir" "$recovery_temp" "$revision_temp"; do [ ! -e "$generated_path" ] && [ ! -L "$generated_path" ] || exit 75; done
    if [ -e "$recovery_file" ] || [ -L "$recovery_file" ]; then [ -f "$recovery_file" ] && [ ! -L "$recovery_file" ] || exit 75; fi
    mkdir "$incoming" "$rollback_dir"`)}
    ${sourcePreparation}
    ${ash.raw(`sync_all || exit 75
    sync_path "$incoming" || exit 75
    sync_path "$rollback_dir" || exit 75
    sync_path "$data_root/backups" || exit 75
    sync_path "$data_root" || exit 75
    current_revision=0
    revision_existed=false
    if [ -e "$revision_file" ] || [ -L "$revision_file" ]; then
      [ -f "$revision_file" ] && [ ! -L "$revision_file" ] || exit 75
      current_revision="$(cat "$revision_file" 2>/dev/null || printf invalid)"
      revision_existed=true
    fi
    case "$current_revision" in ''|*[!0-9]*) exit 75 ;; esac
    next_revision=$((current_revision + 1))
    printf '%s\n' "$next_revision" > "$revision_temp"
    sync_path "$revision_temp" || exit 75
    transaction_committed=false
    transaction_recovery_active=false
    restore_swap_component() {
      restore_component="$1"
      rollback_component="$rollback_dir/$restore_component"
      live_component="$data_root/$restore_component"
      [ ! -L "$rollback_component" ] && [ ! -L "$live_component" ] || return 75
      if [ -d "$rollback_component" ]; then
        rm -rf "$live_component" || return 75
        [ ! -e "$live_component" ] && [ ! -L "$live_component" ] || return 75
        mv "$rollback_component" "$live_component" || return 75
      else
        [ -d "$live_component" ] && [ ! -L "$live_component" ] || return 75
      fi
    }
    restore_previous() {
      restore_swap_component pglite || return $?
      restore_swap_component source-links || return $?
      restore_swap_component server-applied-routes || return $?
      rm -rf "$incoming" || return 75
      rm -f "$revision_temp" || return 75
      if [ "$revision_existed" = true ]; then
        rollback_revision_temp="$data_root/.sync-revision-rollback-$transaction_id.tmp"
        [ ! -e "$rollback_revision_temp" ] && [ ! -L "$rollback_revision_temp" ] || return 75
        printf '%s\n' "$current_revision" > "$rollback_revision_temp" || return 75
        sync_path "$rollback_revision_temp" || return 75
        mv "$rollback_revision_temp" "$revision_file" || return 75
      else
        rm -f "$revision_file" || return 75
      fi
      sync_path "$data_root" || return 75
    }
    write_swap_recovery_status() {
      recovery_status="$1"
      recovery_exit_status="$2"
      recovery_status_temp="$data_root/recovery/.remote-state-$transaction_id-status.tmp"
      [ ! -e "$recovery_status_temp" ] && [ ! -L "$recovery_status_temp" ] || return 75
      printf '{"schemaVersion":"appaloft.remote-state-swap-recovery/v1","status":"%s","operation":"%s","transactionId":"%s","rollbackDirName":"%s","incomingName":"%s","revisionTempName":"%s","expectedRevision":%s,"nextRevision":%s,"backupReference":%s,"exitStatus":%s,"recordedAt":"%s"}\n' "$recovery_status" "$swap_operation" "$transaction_id" "$rollback_name" "$incoming_name" "$revision_temp_name" "$current_revision" "$next_revision" "$(json_string "$backup_reference")" "$recovery_exit_status" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$recovery_status_temp" || return 75
      sync_path "$recovery_status_temp" || return 75
      mv "$recovery_status_temp" "$recovery_file" || return 75
      sync_path "$data_root/recovery" || return 75
    }
    maintenance_operation_cleanup() {
      cleanup_status="$1"
      [ "$transaction_recovery_active" = true ] || return 0
      [ "$transaction_committed" != true ] || return 0
      restore_previous || return 75
      write_swap_recovery_status interrupted "$cleanup_status" || return 75
      transaction_recovery_active=false
    }
    write_swap_recovery_status planned 0 || exit $?
    transaction_recovery_active=true
    mv "$data_root/pglite" "$rollback_dir/pglite"
    mv "$data_root/source-links" "$rollback_dir/source-links"
    mv "$data_root/server-applied-routes" "$rollback_dir/server-applied-routes"
    sync_path "$rollback_dir" || exit 75
    sync_path "$data_root" || exit 75
    mv "$incoming/pglite" "$data_root/pglite"
    mv "$incoming/source-links" "$data_root/source-links"
    mv "$incoming/server-applied-routes" "$data_root/server-applied-routes"
    rm -rf "$incoming"
    commit_state_swap() {
      sync_all || return 75
      sync_path "$data_root" || return 75
      mv "$revision_temp" "$revision_file" || return 75
      sync_path "$data_root" || return 75
      transaction_committed=true
    }
    complete_state_swap() {
      completion_step="$1"
      completion_digest="$2"
      completion_temp="$data_root/recovery/.remote-state-$transaction_id-completed.tmp"
      [ ! -e "$completion_temp" ] && [ ! -L "$completion_temp" ] || return 75
      printf '{"schemaVersion":"appaloft.remote-state-swap-recovery/v1","status":"completed","phase":"remote-state-recovery","step":"%s","operation":"%s","transactionId":"%s","backupReference":%s,"treeDigest":"sha256:%s","revision":%s,"recordedAt":"%s"}\n' "$completion_step" "$swap_operation" "$transaction_id" "$(json_string "$backup_reference")" "$completion_digest" "$next_revision" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$completion_temp" || return 75
      sync_path "$completion_temp" || return 75
      mv "$completion_temp" "$recovery_file" || return 75
      sync_path "$data_root/recovery" || return 75
      transaction_recovery_active=false
    }`)}
  `;
}

export function renderSshRemoteStatePromoteCopyScript(input: {
  dataRoot: string;
  backupReference: string;
  candidateRemoteRuntimeRoot: string;
  candidatePlanDigest: string;
}): AshScript {
  return ash`
    ${remoteStateMaintenancePrelude({
      dataRoot: input.dataRoot,
      owner: "appaloft-cli-promote-copy",
      correlationId: "remote_state_promote_copy",
    })}
    ${immutableBackupReferencePrelude(input.backupReference)}
    ${ash.env("candidate_runtime_root", input.candidateRemoteRuntimeRoot.replace(/\/+$/, ""))}
    ${ash.env("candidate_plan_digest", input.candidatePlanDigest)}
    ${ash.raw(`candidate_plan_hex="\${candidate_plan_digest#sha256:}"
    [ "$candidate_plan_digest" = "sha256:$candidate_plan_hex" ] && [ "\${#candidate_plan_hex}" -eq 64 ] || { echo "candidate plan digest is invalid" >&2; exit 2; }
    case "$candidate_plan_hex" in *[!0-9a-f]*|'') echo "candidate plan digest is invalid" >&2; exit 2 ;; esac
    source_runtime_root="\${data_root%/state}"
    runtime_parent="\${source_runtime_root%/*}"
    case "$candidate_runtime_root" in "$runtime_parent"/recovery/*) ;; *) echo "candidate runtime root must be under the recovery directory" >&2; exit 2 ;; esac
    recovery_runtime_root="$runtime_parent/recovery"
    [ -d "$recovery_runtime_root" ] && [ ! -L "$recovery_runtime_root" ] || { echo "candidate recovery root is not a real directory" >&2; exit 2; }
    ensure_real_directory_path "$recovery_runtime_root" "$candidate_runtime_root" existing || { echo "candidate runtime path is not a real directory chain" >&2; exit 2; }
    live_digest="$(state_tree_digest "$data_root")"
    [ "$live_digest" = "$expected_source_digest" ] || { echo "live state changed after immutable backup" >&2; exit 77; }`)}
    ${stagedStateSwapScript({ source: "candidate" })}
    ${ash.raw(`
    promoted_digest="$(state_tree_digest "$data_root")"
    commit_state_swap
    complete_state_swap promote-copy "$promoted_digest"
    printf '{"status":"promoted","phase":"remote-state-recovery","stateBackend":"ssh-pglite","backupReference":%s,"candidatePlanDigest":%s,"promotedTreeDigest":"sha256:%s","revision":%s}\n' "$(json_string "$backup_reference")" "$(json_string "$candidate_plan_digest")" "$promoted_digest" "$next_revision"`)}
  `;
}

export function buildSshRemoteStatePromoteCopyCommand(input: {
  dataRoot: string;
  backupReference: string;
  candidateRemoteRuntimeRoot: string;
  candidatePlanDigest: string;
}): string {
  return renderShLcCommand(renderSshRemoteStatePromoteCopyScript(input));
}

export function renderSshRemoteStateRollbackScript(input: {
  dataRoot: string;
  backupReference: string;
}): AshScript {
  return ash`
    ${remoteStateMaintenancePrelude({
      dataRoot: input.dataRoot,
      owner: "appaloft-cli-rollback",
      correlationId: "remote_state_rollback",
    })}
    ${immutableBackupReferencePrelude(input.backupReference)}
    ${stagedStateSwapScript({ source: "backup" })}
    ${ash.raw(`
    restored_digest="$(state_tree_digest "$data_root")"
    [ "$restored_digest" = "$expected_source_digest" ] || { echo "restored state digest mismatch" >&2; exit 2; }
    commit_state_swap
    complete_state_swap rollback "$restored_digest"
    printf '{"status":"rolled-back","phase":"remote-state-recovery","stateBackend":"ssh-pglite","backupReference":%s,"restoredTreeDigest":"sha256:%s","revision":%s}\n' "$(json_string "$backup_reference")" "$restored_digest" "$next_revision"`)}
  `;
}

export function buildSshRemoteStateRollbackCommand(input: {
  dataRoot: string;
  backupReference: string;
}): string {
  return renderShLcCommand(renderSshRemoteStateRollbackScript(input));
}

function runSshCommand(input: {
  target: SshRemoteStateTarget;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Result<RemoteStateLockStatus | string> {
  const redactions = input.target.identityFile ? [input.target.identityFile] : [];
  const result = Bun.spawnSync(
    ["ssh", ...buildSshRemoteStateProcessArgs(input.target), input.command],
    {
      cwd: input.cwd,
      env: input.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdout = redactSecrets(result.stdout.toString(), redactions);
  const stderr = redactSecrets(result.stderr.toString(), redactions);

  if (!result.success) {
    return err(
      domainError.infra("SSH remote-state lock command failed", {
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
        host: input.target.host,
        port: String(input.target.port ?? 22),
        exitCode: result.exitCode,
        ...(safeOutput(stderr) ? { stderr: safeOutput(stderr) ?? "" } : {}),
      }),
    );
  }

  return ok(parseRemoteStateLockStatus(stdout));
}

function runRemoteStateLockCommand(input: {
  target: SshRemoteStateTarget;
  command: string;
}): Effect.Effect<void, DomainError> {
  return Effect.gen(function* () {
    const output = yield* resultToEffect(
      runSshCommand({
        target: input.target,
        command: input.command,
        cwd: process.cwd(),
        env: process.env,
      }),
    );

    yield* print(output);
  });
}

const sharedLockOptions = {
  serverHost: serverHostOption,
  serverPort: serverPortOption,
  serverSshUsername: serverSshUsernameOption,
  serverSshPrivateKeyFile: serverSshPrivateKeyFileOption,
  remoteRuntimeRoot: remoteRuntimeRootOption,
  staleAfterSeconds: staleAfterSecondsOption,
};

const inspectCommand = EffectCommand.make("inspect", sharedLockOptions, (options) =>
  Effect.gen(function* () {
    const target = yield* resultToEffect(
      targetFromCommandOptions({
        serverHost: options.serverHost,
        serverPort: optionalValue(options.serverPort),
        serverSshUsername: optionalValue(options.serverSshUsername),
        serverSshPrivateKeyFile: optionalValue(options.serverSshPrivateKeyFile),
      }),
    );
    const staleAfterSeconds = yield* resultToEffect(
      parsePositiveInteger("stale-after-seconds", options.staleAfterSeconds),
    );

    yield* runRemoteStateLockCommand({
      target,
      command: buildSshRemoteStateLockInspectCommand({
        dataRoot: remoteStateDataRoot(options.remoteRuntimeRoot),
        staleAfterSeconds,
      }),
    });
  }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.remoteStateLockInspect));

const recoverStaleCommand = EffectCommand.make("recover-stale", sharedLockOptions, (options) =>
  Effect.gen(function* () {
    const target = yield* resultToEffect(
      targetFromCommandOptions({
        serverHost: options.serverHost,
        serverPort: optionalValue(options.serverPort),
        serverSshUsername: optionalValue(options.serverSshUsername),
        serverSshPrivateKeyFile: optionalValue(options.serverSshPrivateKeyFile),
      }),
    );
    const staleAfterSeconds = yield* resultToEffect(
      parsePositiveInteger("stale-after-seconds", options.staleAfterSeconds),
    );

    yield* runRemoteStateLockCommand({
      target,
      command: buildSshRemoteStateLockRecoverStaleCommand({
        dataRoot: remoteStateDataRoot(options.remoteRuntimeRoot),
        staleAfterSeconds,
      }),
    });
  }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.remoteStateLockRecoverStale));

const remoteStateLockCommand = EffectCommand.make("lock").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.remoteStateLock),
  EffectCommand.withSubcommands([inspectCommand, recoverStaleCommand]),
);

const sharedBackupOptions = {
  serverHost: serverHostOption,
  serverPort: serverPortOption,
  serverSshUsername: serverSshUsernameOption,
  serverSshPrivateKeyFile: serverSshPrivateKeyFileOption,
  remoteRuntimeRoot: remoteRuntimeRootOption,
};

function backupTarget(options: {
  serverHost: string;
  serverPort: ReturnType<typeof optionalValue<string>>;
  serverSshUsername: ReturnType<typeof optionalValue<string>>;
  serverSshPrivateKeyFile: ReturnType<typeof optionalValue<string>>;
}): Result<SshRemoteStateTarget> {
  return targetFromCommandOptions(options);
}

function confirmationResult(confirmed: boolean, operation: string): Result<void> {
  return confirmed
    ? ok(undefined)
    : err(
        domainError.validation(`${operation} requires --confirm`, {
          phase: "remote-state-recovery",
          stateBackend: "ssh-pglite",
        }),
      );
}

const backupCreateCommand = EffectCommand.make("create", sharedBackupOptions, (options) =>
  Effect.gen(function* () {
    const target = yield* resultToEffect(
      backupTarget({
        serverHost: options.serverHost,
        serverPort: optionalValue(options.serverPort),
        serverSshUsername: optionalValue(options.serverSshUsername),
        serverSshPrivateKeyFile: optionalValue(options.serverSshPrivateKeyFile),
      }),
    );
    yield* runRemoteStateLockCommand({
      target,
      command: buildSshRemoteStateImmutableBackupCreateCommand({
        dataRoot: remoteStateDataRoot(options.remoteRuntimeRoot),
      }),
    });
  }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.remoteStateBackupCreate));

const backupRestoreCopyCommand = EffectCommand.make(
  "restore-copy",
  {
    ...sharedBackupOptions,
    backupReference: backupReferenceOption,
    targetRemoteRuntimeRoot: targetRemoteRuntimeRootOption,
  },
  (options) =>
    Effect.gen(function* () {
      const target = yield* resultToEffect(
        backupTarget({
          serverHost: options.serverHost,
          serverPort: optionalValue(options.serverPort),
          serverSshUsername: optionalValue(options.serverSshUsername),
          serverSshPrivateKeyFile: optionalValue(options.serverSshPrivateKeyFile),
        }),
      );
      yield* runRemoteStateLockCommand({
        target,
        command: buildSshRemoteStateRestoreCopyCommand({
          dataRoot: remoteStateDataRoot(options.remoteRuntimeRoot),
          backupReference: options.backupReference,
          targetRemoteRuntimeRoot: options.targetRemoteRuntimeRoot,
        }),
      });
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.remoteStateBackupRestoreCopy));

const backupPromoteCopyCommand = EffectCommand.make(
  "promote-copy",
  {
    ...sharedBackupOptions,
    backupReference: backupReferenceOption,
    candidateRemoteRuntimeRoot: candidateRemoteRuntimeRootOption,
    candidatePlanDigest: candidatePlanDigestOption,
    confirm: confirmOption,
  },
  (options) =>
    Effect.gen(function* () {
      yield* resultToEffect(confirmationResult(options.confirm, "remote-state backup promotion"));
      const target = yield* resultToEffect(
        backupTarget({
          serverHost: options.serverHost,
          serverPort: optionalValue(options.serverPort),
          serverSshUsername: optionalValue(options.serverSshUsername),
          serverSshPrivateKeyFile: optionalValue(options.serverSshPrivateKeyFile),
        }),
      );
      yield* runRemoteStateLockCommand({
        target,
        command: buildSshRemoteStatePromoteCopyCommand({
          dataRoot: remoteStateDataRoot(options.remoteRuntimeRoot),
          backupReference: options.backupReference,
          candidateRemoteRuntimeRoot: options.candidateRemoteRuntimeRoot,
          candidatePlanDigest: options.candidatePlanDigest,
        }),
      });
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.remoteStateBackupPromoteCopy));

const backupRollbackCommand = EffectCommand.make(
  "rollback",
  {
    ...sharedBackupOptions,
    backupReference: backupReferenceOption,
    confirm: confirmOption,
  },
  (options) =>
    Effect.gen(function* () {
      yield* resultToEffect(confirmationResult(options.confirm, "remote-state backup rollback"));
      const target = yield* resultToEffect(
        backupTarget({
          serverHost: options.serverHost,
          serverPort: optionalValue(options.serverPort),
          serverSshUsername: optionalValue(options.serverSshUsername),
          serverSshPrivateKeyFile: optionalValue(options.serverSshPrivateKeyFile),
        }),
      );
      yield* runRemoteStateLockCommand({
        target,
        command: buildSshRemoteStateRollbackCommand({
          dataRoot: remoteStateDataRoot(options.remoteRuntimeRoot),
          backupReference: options.backupReference,
        }),
      });
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.remoteStateBackupRollback));

const remoteStateBackupCommand = EffectCommand.make("backup").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.remoteStateBackup),
  EffectCommand.withSubcommands([
    backupCreateCommand,
    backupRestoreCopyCommand,
    backupPromoteCopyCommand,
    backupRollbackCommand,
  ]),
);

export const remoteStateCommand = EffectCommand.make("remote-state").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.remoteState),
  EffectCommand.withSubcommands([remoteStateLockCommand, remoteStateBackupCommand]),
);
