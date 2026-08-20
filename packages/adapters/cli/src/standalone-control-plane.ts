import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import { AGENT_SETUP_AGENT_LIST, runAgentHostSetup } from "./agent-host-setup.js";
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
import {
  installClaudeCodeMcpHost,
  installCodexMcpHost,
  installCursorMcpHost,
  installOpenCodeMcpHost,
  resolveCodexHome,
  resolveCursorHome,
  resolveOpenCodeHome,
} from "./mcp-host-install.js";

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

function consumeRepeatedFlag(
  args: readonly string[],
  flag: string,
): Result<{ readonly values: readonly string[]; readonly rest: readonly string[] }> {
  const values: string[] = [];
  const rest: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== flag) {
      if (arg !== undefined) {
        rest.push(arg);
      }
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      return err({
        code: "validation_error",
        category: "user",
        message: `Option ${flag} requires a value`,
        retryable: false,
        details: {
          phase: "control-plane-cli-parse",
        },
      });
    }
    values.push(value);
    index += 1;
  }
  return ok({ values, rest });
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
  appaloft code [path|git-remote] [--no-attach] [--local] [--new] [--profile <name-or-id>] [--opencode|--pi|--omp|--claude|--codex|--grok]
  appaloft workspace [--json]
  appaloft deploy [path|git-remote]
  appaloft server list
  appaloft auth status
  appaloft context show
  appaloft workspace open [path|git-remote] [--profile <name-or-id>] [--new] [--no-attach] [--server <id>]
  appaloft workspace create --profile <name-or-id> --repo <https-url> --ref <git-ref> --branch <branch> [--attach]
  appaloft setup agent [-y] [--agent <name>] [--profile <name>] [--cursor-home <path>] [--command <command>]
  appaloft auth mcp login [--url <url>] [--mode cloud|self-hosted] [--profile <name>] [--no-browser]
  appaloft auth mcp claude-code install [--profile <name>] [--server-name <name>] [--command <command>]
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

function renderMcpClaudeCodeInstallHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft Claude Code MCP install

Usage:
  appaloft auth mcp claude-code install [--profile <name>] [--server-name <name>] [--command <command>]

Options:
  --profile <name>      CLI profile to launch with remote-stdio (defaults to the active profile)
  --server-name <name>  Claude Code MCP server name (defaults to appaloft)
  --command <command>   Launcher command (defaults to appaloft)
  --help, -h            Show this help
`);
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

function renderSetupAgentHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`Appaloft agent setup

Usage:
  appaloft setup agent [-y] [--agent <name>] [--profile <name>] [--cursor-home <path>] [--opencode-home <path>] [--agents-home <path>] [--claude-home <path>] [--command <command>] [--skill-dir <path>]

Default-checks universal (~/.agents), Claude Code when ~/.claude exists, and Cursor when ~/.cursor exists. OpenCode is on the agent list (${AGENT_SETUP_AGENT_LIST.join(", ")}) but is not default-checked; pass --agent opencode or use the sibling install commands. Skills are byte-identical copies. MCP reuses appaloft login through remote-stdio: Cursor ~/.cursor/mcp.json and Claude ~/.claude.json. Universal is skills only. Tokens stay in the Appaloft CLI profile store, not in editor config. -y accepts those defaults and skips already-installed skill/MCP entries.

Options:
  -y, --yes               Skip prompts and accept detected defaults
  --agent <name>          Target a specific agent instead of defaults (repeatable): ${AGENT_SETUP_AGENT_LIST.join(", ")}
  --profile <name>        CLI profile to launch with remote-stdio (defaults to the active profile)
  --cursor-home <path>    Cursor home directory (defaults to ~/.cursor)
  --opencode-home <path>  OpenCode config directory (defaults to ~/.config/opencode)
  --agents-home <path>    Shared skills directory (defaults to ~/.agents)
  --claude-home <path>    Claude Code home directory (defaults to ~/.claude)
  --command <command>     Launcher command (defaults to appaloft)
  --skill-dir <path>      Skill source directory (defaults to packaged skills/appaloft)
  --help, -h              Show this help
`);
}

function controlPlaneEnv(input: StandaloneControlPlaneCliInput): CliControlPlaneEnvironment {
  return input.env ?? process.env;
}

async function handleMcpCodexInstall(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const parsed = parseOptions(args, ["profile", "server-name", "codex-home", "command"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const env = controlPlaneEnv(input);
  return finish(
    installCodexMcpHost({
      store: input.store ?? defaultCliControlPlaneProfileStore(input.env),
      requestedProfile: parsed.value.values.profile,
      serverName: parsed.value.values["server-name"],
      command: parsed.value.values.command,
      codexHome: resolveCodexHome({
        explicit: parsed.value.values["codex-home"],
        env,
        home: homedir(),
      }),
    }),
    input,
  );
}

async function handleMcpClaudeCodeInstall(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderMcpClaudeCodeInstallHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const parsed = parseOptions(args, ["profile", "server-name", "command"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const env = controlPlaneEnv(input);
  return finish(
    installClaudeCodeMcpHost({
      store: input.store ?? defaultCliControlPlaneProfileStore(input.env),
      requestedProfile: parsed.value.values.profile,
      serverName: parsed.value.values["server-name"],
      command: parsed.value.values.command,
      home: env.HOME?.trim() || homedir(),
    }),
    input,
  );
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
  const env = controlPlaneEnv(input);
  return finish(
    installCursorMcpHost({
      store: input.store ?? defaultCliControlPlaneProfileStore(input.env),
      requestedProfile: parsed.value.values.profile,
      serverName: parsed.value.values["server-name"],
      command: parsed.value.values.command,
      cursorHome: resolveCursorHome({
        explicit: parsed.value.values["cursor-home"],
        env,
        home: homedir(),
      }),
    }),
    input,
  );
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
  const env = controlPlaneEnv(input);
  return finish(
    installOpenCodeMcpHost({
      store: input.store ?? defaultCliControlPlaneProfileStore(input.env),
      requestedProfile: parsed.value.values.profile,
      serverName: parsed.value.values["server-name"],
      command: parsed.value.values.command,
      opencodeHome: resolveOpenCodeHome({
        explicit: parsed.value.values["opencode-home"],
        env,
        home: homedir(),
      }),
    }),
    input,
  );
}

async function handleSetupAgent(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  if (isHelpArgs(args)) {
    renderSetupAgentHelp(input.stdout ?? process.stdout);
    return { handled: true, exitCode: 0 };
  }
  const normalized = args.map((arg) => (arg === "-y" ? "--yes" : arg));
  const agents = consumeRepeatedFlag(normalized, "--agent");
  if (agents.isErr()) {
    return finish(agents, input);
  }
  const parsed = parseOptions(
    agents.value.rest,
    [
      "profile",
      "server-name",
      "cursor-home",
      "opencode-home",
      "agents-home",
      "claude-home",
      "command",
      "skill-dir",
    ],
    ["yes"],
  );
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const env = controlPlaneEnv(input);
  return finish(
    runAgentHostSetup({
      store: input.store ?? defaultCliControlPlaneProfileStore(input.env),
      env,
      home: env.HOME?.trim() || homedir(),
      requestedProfile: parsed.value.values.profile,
      serverName: parsed.value.values["server-name"],
      command: parsed.value.values.command,
      skillDir: parsed.value.values["skill-dir"],
      agents: agents.value.values,
      cursorHome: parsed.value.values["cursor-home"],
      opencodeHome: parsed.value.values["opencode-home"],
      agentsHome: parsed.value.values["agents-home"],
      claudeHome: parsed.value.values["claude-home"],
    }),
    input,
  );
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
    if (subcommand === "mcp" && args[2] === "claude-code" && args[3] === "install") {
      return handleMcpClaudeCodeInstall(args.slice(4), input);
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
  if (command === "setup") {
    const subcommand = args[1];
    if (
      !subcommand ||
      subcommand === "--help" ||
      subcommand === "-h" ||
      (subcommand === "agent" && isHelpArgs(args.slice(2)))
    ) {
      renderSetupAgentHelp(stdout);
      return { handled: true, exitCode: 0 };
    }
    if (subcommand !== "agent") {
      return finish(parseError("setup requires agent"), input);
    }
    return handleSetupAgent(args.slice(2), input);
  }
  if (command === "context") {
    return handleContext(args.slice(1), input);
  }
  return { handled: false };
}
