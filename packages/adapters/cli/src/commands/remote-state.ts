import { type AshScript, ash } from "@appaloft/ash";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import { optionalValue, print, resultToEffect } from "../runtime.js";
import {
  buildSshRemoteStateProcessArgs,
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
    ${ash.raw(`now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
    if [ ! -d "$lock_dir" ]; then
      printf '{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":false}\\n' "$data_root_json"
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
    if [ "$stale" != true ]; then
      printf '{"status":"active","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"owner":%s,"correlationId":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"recovered":false,"stale":false}\\n' "$data_root_json" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")"
      exit 0
    fi
    mkdir -p "$data_root/locks/recovered"
    recovered_path="$data_root/locks/recovered/manual-$stamp-$$.lock"
    if mv "$lock_dir" "$recovered_path" 2>/dev/null; then
      printf '{"phase":"remote-state-lock","recoveredAt":"%s","recoveredBy":%s,"owner":%s,"correlationId":%s,"lockAgeSeconds":%s}\\n' "$now" "$(json_string "$recovered_by")" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_number "$lock_age_seconds")" > "$recovered_path/recovered.json"
      printf '{"status":"recovered","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"owner":%s,"correlationId":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"recovered":true,"recoveredPath":%s,"stale":true}\\n' "$data_root_json" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")" "$(json_string "$recovered_path")"
    else
      printf '{"status":"race-lost","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":true}\\n' "$data_root_json"
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
    lock_dir="$data_root/locks/mutation.lock"
    owner_file="$lock_dir/owner.json"
    lock_acquired=false
    heartbeat_pid=""
    cleanup_maintenance_lock() { status=$?; trap - EXIT HUP INT TERM; if [ -n "$heartbeat_pid" ]; then kill "$heartbeat_pid" 2>/dev/null || true; wait "$heartbeat_pid" 2>/dev/null || true; fi; if [ "$lock_acquired" = true ] && [ -d "$lock_dir" ]; then rm -rf "$lock_dir"; fi; exit "$status"; }
    trap cleanup_maintenance_lock EXIT HUP INT TERM
    [ -d "$data_root/pglite" ] || { echo "remote PGlite state is unavailable" >&2; exit 1; }
    [ -d "$data_root/source-links" ] || { echo "remote source-link state is unavailable" >&2; exit 1; }
    [ -d "$data_root/server-applied-routes" ] || { echo "remote route state is unavailable" >&2; exit 1; }
    mkdir -p "$data_root/locks" "$data_root/backups" "$data_root/recovery"
    if ! mkdir "$lock_dir" 2>/dev/null; then echo "remote state mutation lock is active" >&2; exit 73; fi
    lock_acquired=true
    now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '{"owner":%s,"correlationId":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":1200}\n' "$(json_string "$owner")" "$(json_string "$correlation_id")" "$now" "$now" > "$owner_file"
    maintenance_heartbeat() { while sleep 15; do heartbeat_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"; heartbeat_tmp="$owner_file.heartbeat.$$"; printf '{"owner":%s,"correlationId":%s,"startedAt":"%s","lastHeartbeatAt":"%s","staleAfterSeconds":1200}\n' "$(json_string "$owner")" "$(json_string "$correlation_id")" "$now" "$heartbeat_at" > "$heartbeat_tmp" && mv "$heartbeat_tmp" "$owner_file" || exit; done; }
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
    [ -f "$archive" ] && [ -f "$manifest" ] || { echo "immutable backup is unavailable" >&2; exit 2; }
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
    revision="$(cat "$data_root/sync-revision.txt" 2>/dev/null || printf 0)"
    case "$revision" in ''|*[!0-9]*) revision=0 ;; esac
    pg_major="$(cat "$data_root/pglite/PG_VERSION" 2>/dev/null || true)"
    case "$pg_major" in ''|*[!0-9]*) echo "remote PGlite PostgreSQL major is invalid" >&2; exit 2 ;; esac
    tar -czf "$archive" -C "$data_root" pglite source-links server-applied-routes
    archive_digest="$(sha256_file "$archive")"
    archive_size="$(wc -c < "$archive" | tr -d ' ')"
    for marker in schema-version.json server-state-backend.json sync-revision.txt; do [ ! -f "$data_root/$marker" ] || cp -p "$data_root/$marker" "$incoming/$marker"; done
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
    target_state="$target_runtime_root/state"
    [ ! -e "$target_state" ] || { echo "candidate state root already exists" >&2; exit 2; }
    incoming="$target_runtime_root/.incoming-state-$$"
    rm -rf "$incoming"
    mkdir -p "$incoming"
    tar -xzf "$archive" -C "$incoming"
    [ -f "$incoming/pglite/PG_VERSION" ] && [ -d "$incoming/source-links" ] && [ -d "$incoming/server-applied-routes" ] || { echo "candidate archive contents are invalid" >&2; exit 2; }
    mkdir -p "$incoming/locks/recovered" "$incoming/backups" "$incoming/journals" "$incoming/recovery"
    for marker in schema-version.json server-state-backend.json sync-revision.txt; do [ ! -f "$backup_root/$marker" ] || { cp -p "$backup_root/$marker" "$incoming/$marker"; chmod 0640 "$incoming/$marker"; }; done
    mkdir -p "$target_runtime_root"
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

function stagedStateSwapBody(input: { source: "candidate" | "backup" }): string {
  const sourcePreparation =
    input.source === "candidate"
      ? 'candidate_state="$candidate_runtime_root/state"; [ -f "$candidate_state/pglite/PG_VERSION" ] && [ -d "$candidate_state/source-links" ] && [ -d "$candidate_state/server-applied-routes" ] || { echo "candidate state is invalid" >&2; exit 2; }; cp -a "$candidate_state/pglite" "$incoming/pglite"; cp -a "$candidate_state/source-links" "$incoming/source-links"; cp -a "$candidate_state/server-applied-routes" "$incoming/server-applied-routes"'
      : 'tar -xzf "$archive" -C "$incoming"; [ -f "$incoming/pglite/PG_VERSION" ] && [ -d "$incoming/source-links" ] && [ -d "$incoming/server-applied-routes" ] || { echo "backup contents are invalid" >&2; exit 2; }';
  return `incoming="$data_root/.incoming-recovery-$$"
    rollback_dir="$data_root/backups/replaced-$(date -u +"%Y%m%dT%H%M%SZ")-$$"
    recovery_file="$data_root/recovery/remote-state-${input.source === "candidate" ? "promotion" : "rollback"}.json"
    rm -rf "$incoming"
    mkdir -p "$incoming" "$rollback_dir"
    ${sourcePreparation}
    restore_previous() { rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes"; cp -a "$rollback_dir/pglite" "$data_root/pglite"; cp -a "$rollback_dir/source-links" "$data_root/source-links"; cp -a "$rollback_dir/server-applied-routes" "$data_root/server-applied-routes"; }
    cp -a "$data_root/pglite" "$rollback_dir/pglite"
    cp -a "$data_root/source-links" "$rollback_dir/source-links"
    cp -a "$data_root/server-applied-routes" "$rollback_dir/server-applied-routes"
    if rm -rf "$data_root/pglite" "$data_root/source-links" "$data_root/server-applied-routes" && mv "$incoming/pglite" "$data_root/pglite" && mv "$incoming/source-links" "$data_root/source-links" && mv "$incoming/server-applied-routes" "$data_root/server-applied-routes"; then
      rm -rf "$incoming"
    else
      status=$?
      rm -rf "$incoming"
      restore_previous
      exit "$status"
    fi
    current_revision="$(cat "$data_root/sync-revision.txt" 2>/dev/null || printf 0)"
    case "$current_revision" in ''|*[!0-9]*) current_revision=0 ;; esac
    next_revision=$((current_revision + 1))
    printf "%s\n" "$next_revision" > "$data_root/sync-revision.txt"`;
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
    live_digest="$(state_tree_digest "$data_root")"
    [ "$live_digest" = "$expected_source_digest" ] || { echo "live state changed after immutable backup" >&2; exit 77; }
    ${stagedStateSwapBody({ source: "candidate" })}
    promoted_digest="$(state_tree_digest "$data_root")"
    printf '{"phase":"remote-state-recovery","step":"promote-copy","backupReference":%s,"candidatePlanDigest":%s,"promotedTreeDigest":"sha256:%s","revision":%s,"recordedAt":"%s"}\n' "$(json_string "$backup_reference")" "$(json_string "$candidate_plan_digest")" "$promoted_digest" "$next_revision" "$now" > "$recovery_file"
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
    ${ash.raw(`${stagedStateSwapBody({ source: "backup" })}
    restored_digest="$(state_tree_digest "$data_root")"
    [ "$restored_digest" = "$expected_source_digest" ] || { restore_previous; echo "restored state digest mismatch" >&2; exit 2; }
    printf '{"phase":"remote-state-recovery","step":"rollback","backupReference":%s,"restoredTreeDigest":"sha256:%s","revision":%s,"recordedAt":"%s"}\n' "$(json_string "$backup_reference")" "$restored_digest" "$next_revision" "$now" > "$recovery_file"
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
