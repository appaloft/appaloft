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

function renderRootHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft CLI

Usage:
  appaloft login [--url <url>] [--mode cloud|self-hosted] [--no-browser]
  appaloft auth mcp login [--url <url>] [--mode cloud|self-hosted] [--profile <name>] [--no-browser]
  appaloft auth mcp codex install [--profile <name>] [--server-name <name>] [--codex-home <path>] [--command <command>]
  appaloft auth token login [--stdin | --token-file <path>] [--url <url>] [--profile <name>]
  appaloft auth status
  appaloft context show
  appaloft server list
  appaloft deploy <path>

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
      err({
        code: "control_plane_profile_not_found",
        category: "user",
        message: "Appaloft MCP profile was not found; run appaloft auth mcp login first",
        retryable: false,
        details: {
          phase: "codex-mcp-install",
          profile: profileName,
        },
      } satisfies DomainError),
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

  try {
    const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
    const next = upsertCodexMcpServerConfig({
      existing,
      serverName,
      command,
      args: ["mcp", "remote-stdio", "--profile", profileName],
    });
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    await writeFile(configPath, next, { mode: 0o600 });
    await chmod(configPath, 0o600).catch(() => undefined);

    return finish(
      ok({
        schemaVersion: "appaloft.codex.mcp-install/v1",
        serverName,
        configPath,
        command,
        args: ["mcp", "remote-stdio", "--profile", profileName],
        profile: {
          name: profile.name,
          baseUrl: profile.baseUrl,
          auth: {
            kind: profile.auth.kind,
            redacted: "***",
          },
        },
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

function handleStatus(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
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
  const parsed = parseOptions(args, ["profile"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  return finish(logoutControlPlane(parsed.value.values.profile, deps(input)), input);
}

function handleContext(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
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
