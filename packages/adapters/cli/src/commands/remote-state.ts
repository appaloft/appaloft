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

type RemoteStateLockStatus = Record<string, string | number | boolean | null>;

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

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

function lockStatusShellPrelude(input: { dataRoot: string; staleAfterSeconds: number }): string[] {
  return [
    "set -eu",
    `data_root=${shellQuote(input.dataRoot)}`,
    `data_root_json=${shellQuote(JSON.stringify(input.dataRoot))}`,
    `stale_after_seconds=${shellQuote(String(input.staleAfterSeconds))}`,
    'lock_dir="$data_root/locks/mutation.lock"',
    'owner_file="$lock_dir/owner.json"',
    'json_string() { if [ "$#" -eq 0 ] || [ -z "$1" ]; then printf null; return; fi; printf \'"\' ; printf "%s" "$1" | sed \'s/\\\\/\\\\\\\\/g; s/"/\\\\"/g\'; printf \'"\' ; }',
    'json_number() { if [ -n "$1" ]; then printf "%s" "$1"; else printf null; fi; }',
    'now_epoch="$(date -u +%s 2>/dev/null || date +%s)"',
    'owner=""',
    'correlation_id=""',
    'started_at=""',
    'last_heartbeat=""',
    'recorded_stale_after=""',
    'heartbeat_epoch=""',
    'lock_age_seconds=""',
    "owner_file_present=false",
    "stale=false",
  ];
}

export function buildSshRemoteStateLockInspectCommand(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
}): string {
  const staleAfterSeconds = input.staleAfterSeconds ?? defaultLockStaleAfterSeconds;
  const script = [
    ...lockStatusShellPrelude({ dataRoot: input.dataRoot, staleAfterSeconds }),
    'if [ ! -d "$data_root" ]; then',
    '  printf \'{"status":"missing","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s}\\n\' "$data_root_json"',
    "  exit 0",
    "fi",
    'if [ ! -d "$lock_dir" ]; then',
    '  printf \'{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"stale":false}\\n\' "$data_root_json"',
    "  exit 0",
    "fi",
    'if [ -f "$owner_file" ]; then',
    "  owner_file_present=true",
    '  owner="$(sed -n \'s/.*"owner"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  correlation_id="$(sed -n \'s/.*"correlationId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  started_at="$(sed -n \'s/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  last_heartbeat="$(sed -n \'s/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  recorded_stale_after="$(sed -n \'s/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    "fi",
    '[ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"',
    'if [ "$recorded_stale_after" -gt "$stale_after_seconds" ]; then recorded_stale_after="$stale_after_seconds"; fi',
    'if [ "$owner_file_present" != true ] && [ "$recorded_stale_after" -gt 30 ]; then recorded_stale_after=30; fi',
    '[ -n "$last_heartbeat" ] || last_heartbeat="$started_at"',
    'if [ -n "$last_heartbeat" ]; then',
    '  heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"',
    "fi",
    'if [ -z "$heartbeat_epoch" ]; then',
    '  heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"',
    "fi",
    'if [ -n "$heartbeat_epoch" ]; then',
    "  lock_age_seconds=$((now_epoch - heartbeat_epoch))",
    "fi",
    'if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then stale=true; fi',
    "status=active",
    'if [ "$stale" = true ]; then status=stale; fi',
    'printf \'{"status":"%s","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"lockPath":%s,"owner":%s,"correlationId":%s,"startedAt":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"stale":%s}\\n\' "$status" "$data_root_json" "$(json_string "$lock_dir")" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$started_at")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")" "$stale"',
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
}

export function buildSshRemoteStateLockRecoverStaleCommand(input: {
  dataRoot: string;
  staleAfterSeconds?: number;
  recoveredBy?: string;
}): string {
  const staleAfterSeconds = input.staleAfterSeconds ?? defaultLockStaleAfterSeconds;
  const recoveredBy = input.recoveredBy ?? "appaloft-cli";
  const script = [
    ...lockStatusShellPrelude({ dataRoot: input.dataRoot, staleAfterSeconds }),
    `recovered_by=${shellQuote(recoveredBy)}`,
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"',
    'if [ ! -d "$lock_dir" ]; then',
    '  printf \'{"status":"unlocked","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":false}\\n\' "$data_root_json"',
    "  exit 0",
    "fi",
    'if [ -f "$owner_file" ]; then',
    "  owner_file_present=true",
    '  owner="$(sed -n \'s/.*"owner"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  correlation_id="$(sed -n \'s/.*"correlationId"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  started_at="$(sed -n \'s/.*"startedAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  last_heartbeat="$(sed -n \'s/.*"lastHeartbeatAt"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    '  recorded_stale_after="$(sed -n \'s/.*"staleAfterSeconds"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$owner_file" | head -n 1 || true)"',
    "fi",
    '[ -n "$recorded_stale_after" ] || recorded_stale_after="$stale_after_seconds"',
    'if [ "$recorded_stale_after" -gt "$stale_after_seconds" ]; then recorded_stale_after="$stale_after_seconds"; fi',
    'if [ "$owner_file_present" != true ] && [ "$recorded_stale_after" -gt 30 ]; then recorded_stale_after=30; fi',
    '[ -n "$last_heartbeat" ] || last_heartbeat="$started_at"',
    'if [ -n "$last_heartbeat" ]; then',
    '  heartbeat_epoch="$(date -u -d "$last_heartbeat" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$last_heartbeat" +%s 2>/dev/null || true)"',
    "fi",
    'if [ -z "$heartbeat_epoch" ]; then',
    '  heartbeat_epoch="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || true)"',
    "fi",
    'if [ -n "$heartbeat_epoch" ]; then',
    "  lock_age_seconds=$((now_epoch - heartbeat_epoch))",
    "fi",
    'if [ -n "$lock_age_seconds" ] && [ "$lock_age_seconds" -ge "$recorded_stale_after" ]; then stale=true; fi',
    'if [ "$stale" != true ]; then',
    '  printf \'{"status":"active","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"owner":%s,"correlationId":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"recovered":false,"stale":false}\\n\' "$data_root_json" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")"',
    "  exit 0",
    "fi",
    'mkdir -p "$data_root/locks/recovered"',
    'recovered_path="$data_root/locks/recovered/manual-$stamp-$$.lock"',
    'if mv "$lock_dir" "$recovered_path" 2>/dev/null; then',
    '  printf \'{"phase":"remote-state-lock","recoveredAt":"%s","recoveredBy":%s,"owner":%s,"correlationId":%s,"lockAgeSeconds":%s}\\n\' "$now" "$(json_string "$recovered_by")" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_number "$lock_age_seconds")" > "$recovered_path/recovered.json"',
    '  printf \'{"status":"recovered","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"owner":%s,"correlationId":%s,"lastHeartbeatAt":%s,"staleAfterSeconds":%s,"lockAgeSeconds":%s,"recovered":true,"recoveredPath":%s,"stale":true}\\n\' "$data_root_json" "$(json_string "$owner")" "$(json_string "$correlation_id")" "$(json_string "$last_heartbeat")" "$(json_number "$recorded_stale_after")" "$(json_number "$lock_age_seconds")" "$(json_string "$recovered_path")"',
    "else",
    '  printf \'{"status":"race-lost","phase":"remote-state-lock","stateBackend":"ssh-pglite","dataRoot":%s,"recovered":false,"stale":true}\\n\' "$data_root_json"',
    "fi",
  ].join("\n");

  return `sh -lc ${shellQuote(script)}`;
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

export const remoteStateCommand = EffectCommand.make("remote-state").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.remoteState),
  EffectCommand.withSubcommands([remoteStateLockCommand]),
);
