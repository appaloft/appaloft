import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneMode,
  type CliControlPlaneProfile,
  type CliControlPlaneProfileStore,
  defaultCliControlPlaneProfileStore,
} from "./control-plane-profile.js";
import {
  type CliControlPlaneDependencies,
  controlPlaneStatus,
  loginControlPlane,
  logoutControlPlane,
  mcpLoginControlPlane,
  tokenLoginControlPlane,
  useControlPlaneProfile,
} from "./control-plane-service.js";

export interface StandaloneControlPlaneCliInput {
  readonly argv?: readonly string[];
  readonly confirmOpenBrowser?: CliControlPlaneDependencies["confirmOpenBrowser"];
  readonly env?: CliControlPlaneEnvironment;
  readonly fetch?: AppaloftSdkFetch;
  readonly monotonicNow?: () => number;
  readonly store?: CliControlPlaneProfileStore;
  readonly now?: () => string;
  readonly onLoginSession?: CliControlPlaneDependencies["onLoginSession"];
  readonly openBrowser?: (url: string) => Promise<boolean> | boolean;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly stdinText?: string;
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
}

export type StandaloneControlPlaneCliResult =
  | {
      readonly handled: false;
    }
  | {
      readonly handled: true;
      readonly exitCode: number;
    };

interface ParsedOptions {
  readonly booleans: Readonly<Record<string, boolean>>;
  readonly values: Readonly<Record<string, string>>;
  readonly positional: readonly string[];
}

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function parseOptions(
  args: readonly string[],
  optionNames: readonly string[],
  booleanOptionNames: readonly string[] = [],
): Result<ParsedOptions> {
  const booleans: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  const positional: string[] = [];
  const allowed = new Set(optionNames);
  const booleanAllowed = new Set(booleanOptionNames);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (booleanAllowed.has(key)) {
      booleans[key] = true;
      continue;
    }

    if (!allowed.has(key)) {
      return err({
        code: "validation_error",
        category: "user",
        message: `Unsupported option --${key}`,
        retryable: false,
        details: {
          phase: "control-plane-cli-parse",
        },
      });
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      return err({
        code: "validation_error",
        category: "user",
        message: `Option --${key} requires a value`,
        retryable: false,
        details: {
          phase: "control-plane-cli-parse",
        },
      });
    }
    values[key] = value;
    index += 1;
  }

  return ok({
    booleans,
    values,
    positional,
  });
}

function parseError(message: string): Result<never> {
  return err({
    code: "validation_error",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "control-plane-cli-parse",
    },
  } satisfies DomainError);
}

function renderJson(stdout: Pick<NodeJS.WriteStream, "write">, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function renderError(stderr: Pick<NodeJS.WriteStream, "write">, error: DomainError): void {
  const phase = typeof error.details?.phase === "string" ? error.details.phase : undefined;
  stderr.write(
    `${error.message}\ncode=${error.code} category=${error.category}${
      phase ? ` phase=${phase}` : ""
    } retryable=${String(error.retryable)}\n`,
  );
}

function deps(input: StandaloneControlPlaneCliInput): CliControlPlaneDependencies {
  return {
    ...(input.env ? { env: input.env } : {}),
    ...(input.confirmOpenBrowser ? { confirmOpenBrowser: input.confirmOpenBrowser } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.monotonicNow ? { monotonicNow: input.monotonicNow } : {}),
    ...(input.store ? { store: input.store } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.onLoginSession ? { onLoginSession: input.onLoginSession } : {}),
    ...(input.openBrowser ? { openBrowser: input.openBrowser } : {}),
    ...(input.sleep ? { sleep: input.sleep } : {}),
  };
}

async function confirmBrowserOpen(): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    await readline.question("");
    return true;
  } finally {
    readline.close();
  }
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function bold(value: string): string {
  return `\u001b[1m${value}\u001b[22m`;
}

function isHelpArgs(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function renderLoginHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft login

Usage:
  appaloft login [--url <url>] [--mode cloud|self-hosted] [--no-browser]
  appaloft auth login [--url <url>] [--mode cloud|self-hosted] [--no-browser]

Options:
  --url <url>              Control plane URL (defaults to https://app.appaloft.com)
  --mode cloud|self-hosted Control plane mode
  --no-browser             Print the login URL without opening a browser
  --profile <name>         Profile name to write
  --help, -h               Show this help
`);
}

function renderAuthStatusHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft auth status

Usage:
  appaloft auth status [--profile <name>]

Options:
  --profile <name>  Profile to inspect
  --help, -h        Show this help
`);
}

function renderLogoutHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft logout

Usage:
  appaloft logout [--profile <name>]
  appaloft auth logout [--profile <name>]

Options:
  --profile <name>  Profile to remove
  --help, -h        Show this help
`);
}

function renderTokenLoginHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft token login

Usage:
  appaloft auth token login [--stdin | --token-file <path>] [--url <url>] [--profile <name>]

Options:
  --stdin              Read the token from stdin
  --token-file <path>  Read the token from a file
  --url <url>          Control plane URL
  --profile <name>     Profile name to write
  --help, -h           Show this help
`);
}

function renderMcpLoginHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft MCP login

Usage:
  appaloft auth mcp login [--url <url>] [--mode cloud|self-hosted] [--profile <name>] [--no-browser]

Options:
  --url <url>              Control plane URL (defaults to https://app.appaloft.com)
  --mode cloud|self-hosted Control plane mode
  --profile <name>         Profile name to write
  --no-browser             Print the login URL without opening a browser
  --help, -h               Show this help
`);
}

function renderRootHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft CLI

Usage:
  appaloft login [--url <url>] [--mode cloud|self-hosted] [--no-browser]
  appaloft code [path|git-remote] [--no-attach] [--local] [--new] [--profile <name-or-id>] [--harness opencode|pi]
  appaloft workspace [--json]
  appaloft deploy [path|git-remote]
  appaloft server list
  appaloft auth status
  appaloft context show
  appaloft workspace open [path|git-remote] [--profile <name-or-id>] [--new] [--no-attach] [--server <id>]
  appaloft workspace create --profile <name-or-id> --repo <https-url> --ref <git-ref> --branch <branch> [--attach]
  appaloft auth mcp login [--url <url>] [--mode cloud|self-hosted] [--profile <name>] [--no-browser]
  appaloft auth mcp codex install [--profile <name>] [--server-name <name>] [--codex-home <path>] [--command <command>]
  appaloft auth mcp cursor install [--profile <name>] [--server-name <name>] [--cursor-home <path>] [--command <command>]
  appaloft auth mcp opencode install [--profile <name>] [--server-name <name>] [--opencode-home <path>] [--command <command>]
  appaloft auth token login [--stdin | --token-file <path>] [--url <url>] [--profile <name>]

Options:
  --help, -h     Show this help
  --version      Show CLI version
`);
}

function renderVersion(
  stdout: Pick<NodeJS.WriteStream, "write">,
  env: CliControlPlaneEnvironment | undefined,
): void {
  stdout.write(`${env?.APPALOFT_APP_VERSION ?? process.env.APPALOFT_APP_VERSION ?? "0.0.0"}\n`);
}

function renderLoginSession(
  stderr: Pick<NodeJS.WriteStream, "write">,
  session: Parameters<NonNullable<CliControlPlaneDependencies["onLoginSession"]>>[0],
): void {
  const browserLine = session.browserOpenRequiresConfirmation
    ? "Press Enter to open the Appaloft CLI login page in your browser."
    : session.openedBrowser
      ? "Opened the Appaloft CLI login page in your browser."
      : "Open this Appaloft CLI login URL in a signed-in browser.";
  const fallbackLine = session.openBrowserFailed
    ? "\nBrowser launch failed, use this URL manually."
    : "";
  const codeLine = `Code: ${bold(session.userCode)}`;
  const matchLine = session.browserOpenRequiresConfirmation
    ? "\nAfter the browser opens, confirm that the page shows the same code."
    : "";

  stderr.write(
    `${browserLine}${fallbackLine}\nURL: ${session.verificationUriComplete}\n${codeLine}${matchLine}\n`,
  );
}

function modeValue(value: string | undefined): Result<CliControlPlaneMode | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }
  if (value === "cloud" || value === "self-hosted") {
    return ok(value);
  }

  return parseError("Control plane mode must be cloud or self-hosted");
}

async function finish<T>(
  result: Promise<Result<T>> | Result<T>,
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const stdout = input.stdout ?? process.stdout;
  const stderr = input.stderr ?? process.stderr;
  const awaited = await result;

  if (awaited.isErr()) {
    renderError(stderr, awaited.error);
    return { handled: true, exitCode: 1 };
  }

  renderJson(stdout, awaited.value);
  return { handled: true, exitCode: 0 };
}

async function handleLogin(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderLoginHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const parsed = parseOptions(args, ["url", "mode", "profile"], ["no-browser"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const mode = modeValue(parsed.value.values.mode);
  if (mode.isErr()) {
    return finish(mode, input);
  }
  const url = parsed.value.values.url;
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  process.once("SIGINT", abort);
  const stderr = input.stderr ?? process.stderr;

  try {
    return await finish(
      loginControlPlane(
        {
          ...(url ? { url } : {}),
          ...(mode.value ? { mode: mode.value } : {}),
          ...(parsed.value.booleans["no-browser"] ? { openBrowser: false } : {}),
          ...(parsed.value.values.profile ? { profile: parsed.value.values.profile } : {}),
          signal: abortController.signal,
        },
        deps({
          ...input,
          onLoginSession:
            input.onLoginSession ?? ((session) => renderLoginSession(stderr, session)),
          confirmOpenBrowser: input.confirmOpenBrowser ?? confirmBrowserOpen,
        }),
      ),
      input,
    );
  } finally {
    process.off("SIGINT", abort);
  }
}

async function handleMcpLogin(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderMcpLoginHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const parsed = parseOptions(args, ["url", "mode", "profile"], ["no-browser"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const mode = modeValue(parsed.value.values.mode);
  if (mode.isErr()) {
    return finish(mode, input);
  }
  const url = parsed.value.values.url;
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  process.once("SIGINT", abort);
  const stderr = input.stderr ?? process.stderr;

  try {
    return await finish(
      mcpLoginControlPlane(
        {
          ...(url ? { url } : {}),
          ...(mode.value ? { mode: mode.value } : {}),
          ...(parsed.value.booleans["no-browser"] ? { openBrowser: false } : {}),
          ...(parsed.value.values.profile ? { profile: parsed.value.values.profile } : {}),
          signal: abortController.signal,
        },
        deps({
          ...input,
          onLoginSession:
            input.onLoginSession ?? ((session) => renderLoginSession(stderr, session)),
          confirmOpenBrowser: input.confirmOpenBrowser ?? confirmBrowserOpen,
        }),
      ),
      input,
    );
  } finally {
    process.off("SIGINT", abort);
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map((value) => tomlString(value)).join(", ")}]`;
}

function escapeTomlTableSegment(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

function upsertCodexMcpServerConfig(input: {
  readonly existing: string;
  readonly serverName: string;
  readonly command: string;
  readonly args: readonly string[];
}): string {
  const tablePrefix = `[mcp_servers.${escapeTomlTableSegment(input.serverName)}`;
  const lines = input.existing.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      skipping = line.startsWith(tablePrefix);
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  while (kept.length > 0 && kept.at(-1)?.trim() === "") {
    kept.pop();
  }

  kept.push(
    "",
    `[mcp_servers.${escapeTomlTableSegment(input.serverName)}]`,
    `command = ${tomlString(input.command)}`,
    `args = ${tomlStringArray(input.args)}`,
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 120",
    "",
  );

  return `${kept.join("\n")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mcpRemoteStdioArgs(profileName: string): readonly string[] {
  return ["mcp", "remote-stdio", "--profile", profileName];
}

function redactedMcpInstallProfile(profile: CliControlPlaneProfile): {
  readonly name: string;
  readonly baseUrl: string;
  readonly auth: {
    readonly kind: CliControlPlaneProfile["auth"]["kind"];
    readonly redacted: "***";
  };
} {
  return {
    name: profile.name,
    baseUrl: profile.baseUrl,
    auth: {
      kind: profile.auth.kind,
      redacted: "***",
    },
  };
}

function parseJsonObjectFile(input: {
  readonly existing: string;
  readonly configPath: string;
  readonly phase: string;
  readonly code: string;
  readonly message: string;
}): Result<Record<string, unknown>> {
  const trimmed = input.existing.trim();
  if (!trimmed) {
    return ok({});
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      return err({
        code: input.code,
        category: "user",
        message: input.message,
        retryable: false,
        details: {
          phase: input.phase,
          configPath: input.configPath,
          reason: "json-root-not-object",
        },
      } satisfies DomainError);
    }
    return ok(parsed);
  } catch (error) {
    return err({
      code: input.code,
      category: "user",
      message: input.message,
      retryable: false,
      details: {
        phase: input.phase,
        configPath: input.configPath,
        reason: "json-parse-failed",
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies DomainError);
  }
}

function upsertJsonNamedEntry(input: {
  readonly root: Record<string, unknown>;
  readonly collectionKey: string;
  readonly serverName: string;
  readonly entry: Record<string, unknown>;
  readonly configPath: string;
  readonly phase: string;
  readonly code: string;
  readonly message: string;
}): Result<Record<string, unknown>> {
  const existingCollection = input.root[input.collectionKey];
  if (existingCollection === undefined) {
    return ok({
      ...input.root,
      [input.collectionKey]: {
        [input.serverName]: input.entry,
      },
    });
  }
  if (!isPlainObject(existingCollection)) {
    return err({
      code: input.code,
      category: "user",
      message: input.message,
      retryable: false,
      details: {
        phase: input.phase,
        configPath: input.configPath,
        reason: "json-collection-not-object",
        collectionKey: input.collectionKey,
      },
    } satisfies DomainError);
  }

  return ok({
    ...input.root,
    [input.collectionKey]: {
      ...existingCollection,
      [input.serverName]: input.entry,
    },
  });
}

async function writeOwnerOnlyFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

function profileNotFoundError(input: {
  readonly profileName: string;
  readonly phase: string;
  readonly message: string;
}): DomainError {
  return {
    code: "control_plane_profile_not_found",
    category: "user",
    message: input.message,
    retryable: false,
    details: {
      phase: input.phase,
      profile: input.profileName,
    },
  };
}

function resolveSelectedMcpProfile(input: {
  readonly requestedName: string | undefined;
  readonly activeProfile: string | undefined;
  readonly profiles: Readonly<Record<string, CliControlPlaneProfile>>;
  readonly defaultName?: string;
}):
  | { readonly kind: "missing"; readonly profileName: string }
  | { readonly kind: "found"; readonly profile: CliControlPlaneProfile } {
  const profileName = input.requestedName ?? input.activeProfile ?? input.defaultName;
  if (!profileName) {
    return { kind: "missing", profileName: input.requestedName ?? "" };
  }
  const profile = input.profiles[profileName];
  if (!profile) {
    return { kind: "missing", profileName };
  }
  return { kind: "found", profile };
}

function renderMcpCursorInstallHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft Cursor MCP install

Usage:
  appaloft auth mcp cursor install [--profile <name>] [--server-name <name>] [--cursor-home <path>] [--command <command>]

Options:
  --profile <name>      CLI profile to launch with remote-stdio (defaults to the active profile)
  --server-name <name>  Cursor MCP server name (defaults to appaloft)
  --cursor-home <path>  Cursor home directory (defaults to ~/.cursor)
  --command <command>   Launcher command (defaults to appaloft)
  --help, -h            Show this help
`);
}

function renderMcpOpenCodeInstallHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft OpenCode MCP install

Usage:
  appaloft auth mcp opencode install [--profile <name>] [--server-name <name>] [--opencode-home <path>] [--command <command>]

Options:
  --profile <name>        CLI profile to launch with remote-stdio (defaults to the active profile)
  --server-name <name>    OpenCode MCP server name (defaults to appaloft)
  --opencode-home <path>  OpenCode config directory (defaults to ~/.config/opencode)
  --command <command>     Launcher command (defaults to appaloft)
  --help, -h              Show this help
`);
}

async function handleMcpCodexInstall(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const parsed = parseOptions(args, ["profile", "server-name", "codex-home", "command"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }

  const profileName = parsed.value.values.profile ?? "mcp";
  const serverName = parsed.value.values["server-name"] ?? "appaloft";
  const command = parsed.value.values.command ?? "appaloft";
  const codexHome =
    parsed.value.values["codex-home"] ??
    input.env?.CODEX_HOME?.trim() ??
    process.env.CODEX_HOME?.trim() ??
    join(homedir(), ".codex");
  const configPath = join(codexHome, "config.toml");
  const store = input.store ?? defaultCliControlPlaneProfileStore(input.env);
  const storeData = await store.read();
  if (storeData.isErr()) {
    return finish(storeData, input);
  }

  const profile = storeData.value.profiles[profileName];
  if (!profile) {
    return finish(
      err(
        profileNotFoundError({
          profileName,
          phase: "codex-mcp-install",
          message: "Appaloft MCP profile was not found; run appaloft auth mcp login first",
        }),
      ),
      input,
    );
  }
  if (profile.auth.kind !== "bearer") {
    return finish(
      err({
        code: "validation_error",
        category: "user",
        message: "Codex MCP install requires a bearer MCP profile; run appaloft auth mcp login",
        retryable: false,
        details: {
          phase: "codex-mcp-install",
          profile: profileName,
        },
      } satisfies DomainError),
      input,
    );
  }

  const argsForConfig = mcpRemoteStdioArgs(profileName);
  try {
    const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
    const next = upsertCodexMcpServerConfig({
      existing,
      serverName,
      command,
      args: argsForConfig,
    });
    await writeOwnerOnlyFile(configPath, next);

    return finish(
      ok({
        schemaVersion: "appaloft.codex.mcp-install/v1",
        serverName,
        configPath,
        command,
        args: argsForConfig,
        profile: redactedMcpInstallProfile(profile),
      }),
      input,
    );
  } catch (error) {
    return finish(
      err({
        code: "codex_mcp_config_write_failed",
        category: "infra",
        message: "Codex MCP config could not be written",
        retryable: true,
        details: {
          phase: "codex-mcp-install",
          configPath,
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies DomainError),
      input,
    );
  }
}

async function handleMcpCursorInstall(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderMcpCursorInstallHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const parsed = parseOptions(args, ["profile", "server-name", "cursor-home", "command"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }

  const serverName = parsed.value.values["server-name"] ?? "appaloft";
  const command = parsed.value.values.command ?? "appaloft";
  const cursorHome =
    parsed.value.values["cursor-home"] ??
    input.env?.CURSOR_HOME?.trim() ??
    process.env.CURSOR_HOME?.trim() ??
    join(homedir(), ".cursor");
  const configPath = join(cursorHome, "mcp.json");
  const store = input.store ?? defaultCliControlPlaneProfileStore(input.env);
  const storeData = await store.read();
  if (storeData.isErr()) {
    return finish(storeData, input);
  }

  const selected = resolveSelectedMcpProfile({
    requestedName: parsed.value.values.profile,
    activeProfile: storeData.value.activeProfile,
    profiles: storeData.value.profiles,
  });
  if (selected.kind === "missing") {
    return finish(
      err(
        profileNotFoundError({
          profileName: selected.profileName,
          phase: "cursor-mcp-install",
          message:
            "Appaloft CLI profile was not found; run appaloft login or appaloft auth mcp login first",
        }),
      ),
      input,
    );
  }
  const argsForConfig = mcpRemoteStdioArgs(selected.profile.name);
  const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const parsedRoot = parseJsonObjectFile({
    existing,
    configPath,
    phase: "cursor-mcp-install",
    code: "cursor_mcp_config_write_failed",
    message: "Cursor MCP config could not be parsed as a JSON object",
  });
  if (parsedRoot.isErr()) {
    return finish(parsedRoot, input);
  }
  const nextRoot = upsertJsonNamedEntry({
    root: parsedRoot.value,
    collectionKey: "mcpServers",
    serverName,
    entry: {
      command,
      args: [...argsForConfig],
    },
    configPath,
    phase: "cursor-mcp-install",
    code: "cursor_mcp_config_write_failed",
    message: "Cursor MCP config mcpServers must be a JSON object",
  });
  if (nextRoot.isErr()) {
    return finish(nextRoot, input);
  }

  try {
    await writeOwnerOnlyFile(configPath, `${JSON.stringify(nextRoot.value, null, 2)}\n`);
    return finish(
      ok({
        schemaVersion: "appaloft.cursor.mcp-install/v1",
        serverName,
        configPath,
        command,
        args: argsForConfig,
        profile: redactedMcpInstallProfile(selected.profile),
      }),
      input,
    );
  } catch (error) {
    return finish(
      err({
        code: "cursor_mcp_config_write_failed",
        category: "infra",
        message: "Cursor MCP config could not be written",
        retryable: true,
        details: {
          phase: "cursor-mcp-install",
          configPath,
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies DomainError),
      input,
    );
  }
}

async function handleMcpOpenCodeInstall(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderMcpOpenCodeInstallHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const parsed = parseOptions(args, ["profile", "server-name", "opencode-home", "command"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }

  const serverName = parsed.value.values["server-name"] ?? "appaloft";
  const command = parsed.value.values.command ?? "appaloft";
  const xdgConfigHome =
    input.env?.XDG_CONFIG_HOME?.trim() ?? process.env.XDG_CONFIG_HOME?.trim() ?? "";
  const opencodeHome =
    parsed.value.values["opencode-home"] ??
    (xdgConfigHome ? join(xdgConfigHome, "opencode") : join(homedir(), ".config", "opencode"));
  const configPath = join(opencodeHome, "opencode.json");
  const store = input.store ?? defaultCliControlPlaneProfileStore(input.env);
  const storeData = await store.read();
  if (storeData.isErr()) {
    return finish(storeData, input);
  }

  const selected = resolveSelectedMcpProfile({
    requestedName: parsed.value.values.profile,
    activeProfile: storeData.value.activeProfile,
    profiles: storeData.value.profiles,
  });
  if (selected.kind === "missing") {
    return finish(
      err(
        profileNotFoundError({
          profileName: selected.profileName,
          phase: "opencode-mcp-install",
          message:
            "Appaloft CLI profile was not found; run appaloft login or appaloft auth mcp login first",
        }),
      ),
      input,
    );
  }
  const argsForConfig = mcpRemoteStdioArgs(selected.profile.name);
  const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const parsedRoot = parseJsonObjectFile({
    existing,
    configPath,
    phase: "opencode-mcp-install",
    code: "opencode_mcp_config_write_failed",
    message: "OpenCode MCP config could not be parsed as a JSON object",
  });
  if (parsedRoot.isErr()) {
    return finish(parsedRoot, input);
  }
  const nextRoot = upsertJsonNamedEntry({
    root: parsedRoot.value,
    collectionKey: "mcp",
    serverName,
    entry: {
      type: "local",
      command: [command, ...argsForConfig],
      enabled: true,
    },
    configPath,
    phase: "opencode-mcp-install",
    code: "opencode_mcp_config_write_failed",
    message: "OpenCode MCP config mcp must be a JSON object",
  });
  if (nextRoot.isErr()) {
    return finish(nextRoot, input);
  }

  try {
    await writeOwnerOnlyFile(configPath, `${JSON.stringify(nextRoot.value, null, 2)}\n`);
    return finish(
      ok({
        schemaVersion: "appaloft.opencode.mcp-install/v1",
        serverName,
        configPath,
        command,
        args: argsForConfig,
        profile: redactedMcpInstallProfile(selected.profile),
      }),
      input,
    );
  } catch (error) {
    return finish(
      err({
        code: "opencode_mcp_config_write_failed",
        category: "infra",
        message: "OpenCode MCP config could not be written",
        retryable: true,
        details: {
          phase: "opencode-mcp-install",
          configPath,
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies DomainError),
      input,
    );
  }
}

function handleStatus(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderAuthStatusHelp(input.stdout ?? process.stdout);
    return Promise.resolve({ handled: true, exitCode: 0 });
  }
  const parsed = parseOptions(args, ["profile"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  return finish(controlPlaneStatus(parsed.value.values.profile, deps(input)), input);
}

async function handleTokenLogin(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderTokenLoginHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const parsed = parseOptions(args, ["url", "mode", "profile", "token-file"], ["stdin"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const mode = modeValue(parsed.value.values.mode);
  if (mode.isErr()) {
    return finish(mode, input);
  }
  if (parsed.value.booleans.stdin && parsed.value.values["token-file"]) {
    return finish(parseError("Use either --stdin or --token-file, not both"), input);
  }

  const token = parsed.value.values["token-file"]
    ? await readFile(parsed.value.values["token-file"], "utf8")
    : parsed.value.booleans.stdin
      ? (input.stdinText ?? (await readStdinText()))
      : undefined;

  return finish(
    tokenLoginControlPlane(
      {
        ...(parsed.value.values.url ? { url: parsed.value.values.url } : {}),
        ...(mode.value ? { mode: mode.value } : {}),
        ...(parsed.value.values.profile ? { profile: parsed.value.values.profile } : {}),
        ...(token === undefined ? {} : { token }),
      },
      deps(input),
    ),
    input,
  );
}

function handleLogout(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderLogoutHelp(input.stdout ?? process.stdout);
    return Promise.resolve({ handled: true, exitCode: 0 });
  }
  const parsed = parseOptions(args, ["profile"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  return finish(logoutControlPlane(parsed.value.values.profile, deps(input)), input);
}

function renderContextHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft context

Usage:
  appaloft context list
  appaloft context show [--profile <name>]
  appaloft context use <profile>

Options:
  --help, -h  Show this help
`);
}

function handleContext(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderContextHelp(input.stdout ?? process.stdout);
    return Promise.resolve({ handled: true, exitCode: 0 });
  }
  const subcommand = args[0];
  if (subcommand === "list") {
    return handleStatus(args.slice(1), input);
  }
  if (subcommand === "show") {
    return handleStatus(args.slice(1), input);
  }
  if (subcommand === "use") {
    const profile = args[1];
    if (!profile) {
      return finish(parseError("context use requires a profile name"), input);
    }
    return finish(useControlPlaneProfile(profile, deps(input)), input);
  }

  return finish(parseError("context requires list, show, or use"), input);
}

export async function runStandaloneControlPlaneCli(
  input: StandaloneControlPlaneCliInput = {},
): Promise<StandaloneControlPlaneCliResult> {
  const args = commandArgs(input.argv ?? process.argv);
  const command = args[0];
  const stdout = input.stdout ?? process.stdout;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    renderRootHelp(stdout);
    return { handled: true, exitCode: 0 };
  }
  if (command === "--version" || command === "version") {
    renderVersion(stdout, input.env);
    return { handled: true, exitCode: 0 };
  }

  if (command === "login") {
    return handleLogin(args.slice(1), input);
  }
  if (command === "logout") {
    return handleLogout(args.slice(1), input);
  }
  if (command === "auth") {
    const subcommand = args[1];
    if (subcommand === "login") {
      return handleLogin(args.slice(2), input);
    }
    if (subcommand === "token" && args[2] === "login") {
      return handleTokenLogin(args.slice(3), input);
    }
    if (subcommand === "mcp" && args[2] === "login") {
      return handleMcpLogin(args.slice(3), input);
    }
    if (subcommand === "mcp" && args[2] === "codex" && args[3] === "install") {
      return handleMcpCodexInstall(args.slice(4), input);
    }
    if (subcommand === "mcp" && args[2] === "cursor" && args[3] === "install") {
      return handleMcpCursorInstall(args.slice(4), input);
    }
    if (subcommand === "mcp" && args[2] === "opencode" && args[3] === "install") {
      return handleMcpOpenCodeInstall(args.slice(4), input);
    }
    if (subcommand === "status") {
      return handleStatus(args.slice(2), input);
    }
    if (subcommand === "logout") {
      return handleLogout(args.slice(2), input);
    }
    return { handled: false };
  }
  if (command === "context") {
    return handleContext(args.slice(1), input);
  }
  return { handled: false };
}
