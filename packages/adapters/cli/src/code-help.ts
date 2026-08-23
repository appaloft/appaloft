import { cliCommandDescriptions } from "./commands/docs-help.js";

export const EFFECT_HELP_GENERIC_BOOLEAN = "A true or false value";
export const EFFECT_HELP_GENERIC_TEXT = "A user-defined piece of text";
export const EFFECT_HELP_OPTIONAL_PROSE = "This setting is optional";

export const CODE_OPTION_DESCRIPTIONS = {
  path: "Local path or git remote to occupy, defaulting to this directory; a git remote occupies that repo without cloning it here.",
  noAttach: "Occupy the Sandbox and print the banner without attaching the agent TUI.",
  local:
    "Open this-Mac scratch instead of occupying a remote Sandbox; rejects a git-remote locator.",
  forceNew: "Start a new isolated Workspace instead of resuming the live session.",
  yes: "Skip folder-onboarding prompts and create a project named after this directory.",
  open: "After occupy, print and open the default preview, pull request, or compare URL.",
  openTarget: "Choose which URL --open uses: preview, production, pr, compare, or connections.",
  profile:
    "Pin an Agent Workspace Profile name or installation id; default OpenCode omits this so the live session can resume.",
  server: "Place the Sandbox on this registered BYOS Server id, defaulting to the enrolled Server.",
  opencode: "Use the OpenCode harness.",
  pi: "Use the Pi harness.",
  omp: "Use the OMP harness.",
  claude:
    "Launch Claude Code on the remote Sandbox. Copies this Mac's Claude setup-token into the selected remote Workspace HOME; it is never printed or placed in MCP/env. Remove that HOME-relative copy with `appaloft sandbox file remove <sandboxId> --path .claude/setup-token`; deleting the remote copy does not revoke upstream access, so also revoke the corresponding Claude session in the upstream account security console.",
  codex:
    "Launch Codex on the remote Sandbox. Copies this Mac's ~/.codex/auth.json into the selected remote Workspace HOME; it is never printed or placed in MCP/env. Remove that HOME-relative copy with `appaloft sandbox file remove <sandboxId> --path .codex/auth.json`; deleting the remote copy does not revoke upstream access, so also revoke the corresponding Codex/OpenAI session in the upstream account security console.",
  grok: "Launch Grok on the remote Sandbox. Copies this Mac's ~/.grok/auth.json into the selected remote Workspace HOME; it is never printed or placed in MCP/env. Remove that HOME-relative copy with `appaloft sandbox file remove <sandboxId> --path .grok/auth.json`; deleting the remote copy does not revoke upstream access, so also revoke the corresponding Grok session in the upstream account security console.",
  harness:
    "Compatibility only. Prefer --opencode, --pi, --omp, --claude, --codex, or --grok. Cannot combine with a different agent alias.",
  help: "Show this help.",
} as const;

const CODE_HELP_OPTION_ROWS: readonly {
  readonly flag: string;
  readonly description: string;
}[] = [
  { flag: "path|git-remote", description: CODE_OPTION_DESCRIPTIONS.path },
  { flag: "--no-attach", description: CODE_OPTION_DESCRIPTIONS.noAttach },
  { flag: "--local", description: CODE_OPTION_DESCRIPTIONS.local },
  { flag: "--new", description: CODE_OPTION_DESCRIPTIONS.forceNew },
  { flag: "--yes", description: CODE_OPTION_DESCRIPTIONS.yes },
  { flag: "--open", description: CODE_OPTION_DESCRIPTIONS.open },
  {
    flag: "--open-target preview|production|pr|compare|connections",
    description: CODE_OPTION_DESCRIPTIONS.openTarget,
  },
  { flag: "--profile <name>", description: CODE_OPTION_DESCRIPTIONS.profile },
  { flag: "--server <id>", description: CODE_OPTION_DESCRIPTIONS.server },
  { flag: "--opencode", description: CODE_OPTION_DESCRIPTIONS.opencode },
  { flag: "--pi", description: CODE_OPTION_DESCRIPTIONS.pi },
  { flag: "--omp", description: CODE_OPTION_DESCRIPTIONS.omp },
  { flag: "--claude", description: CODE_OPTION_DESCRIPTIONS.claude },
  { flag: "--codex", description: CODE_OPTION_DESCRIPTIONS.codex },
  { flag: "--grok", description: CODE_OPTION_DESCRIPTIONS.grok },
  {
    flag: "--harness opencode|pi|omp|claude|codex|grok",
    description: CODE_OPTION_DESCRIPTIONS.harness,
  },
  { flag: "--help, -h", description: CODE_OPTION_DESCRIPTIONS.help },
];

const CODE_HELP_FLAG_WIDTH = 54;

const BUILT_IN_HELP_OPTIONS = new Set([
  "--completions",
  "--help",
  "-h",
  "--log-level",
  "--version",
  "--wizard",
]);

const CODE_HELP_OPTIONS = new Set([
  ...BUILT_IN_HELP_OPTIONS,
  "--no-attach",
  "--local",
  "--new",
  "--yes",
  "--open",
  "--open-target",
  "--profile",
  "--server",
  "--opencode",
  "--pi",
  "--omp",
  "--claude",
  "--codex",
  "--grok",
  "--harness",
]);

const WORKSPACE_OPEN_HELP_OPTIONS = new Set([
  ...BUILT_IN_HELP_OPTIONS,
  "--profile",
  "--new",
  "--no-attach",
  "--server",
]);
const BUILT_IN_VALUE_OPTIONS = new Set(["--completions", "--log-level"]);
const CODE_HELP_VALUE_OPTIONS = new Set([
  ...BUILT_IN_VALUE_OPTIONS,
  "--open-target",
  "--profile",
  "--server",
  "--harness",
]);
const WORKSPACE_OPEN_HELP_VALUE_OPTIONS = new Set([
  ...BUILT_IN_VALUE_OPTIONS,
  "--profile",
  "--server",
]);

export function cliUserArgs(argv: readonly string[]): readonly string[] {
  const afterRuntime = argv.slice(2).filter((arg) => arg !== "--");
  return afterRuntime[0] === "appaloft" ? afterRuntime.slice(1) : afterRuntime;
}

export function isCodeHelpInvocation(argv: readonly string[]): boolean {
  const args = cliUserArgs(argv);
  return (
    args[0] === "code" &&
    (args.includes("--help") || args.includes("-h")) &&
    unsupportedCliHelpOption(argv) === undefined
  );
}

function optionName(arg: string): string {
  const equals = arg.indexOf("=");
  return equals === -1 ? arg : arg.slice(0, equals);
}

export function unsupportedCliHelpOption(argv: readonly string[]): string | undefined {
  const args = cliUserArgs(argv);
  if (!args.includes("--help") && !args.includes("-h")) return undefined;

  const commandPathLength =
    args[0] === "code" ? 1 : args[0] === "workspace" && args[1] === "open" ? 2 : 0;
  if (commandPathLength === 0) return undefined;

  const allowed = commandPathLength === 1 ? CODE_HELP_OPTIONS : WORKSPACE_OPEN_HELP_OPTIONS;
  const valueOptions =
    commandPathLength === 1 ? CODE_HELP_VALUE_OPTIONS : WORKSPACE_OPEN_HELP_VALUE_OPTIONS;
  const commandArgs = args.slice(commandPathLength);
  let positionalCount = 0;
  for (let index = 0; index < commandArgs.length; index += 1) {
    const arg = commandArgs[index];
    if (!arg || arg === "--") continue;
    if (!arg.startsWith("-")) {
      positionalCount += 1;
      if (positionalCount > 1) return arg;
      continue;
    }

    const name = optionName(arg);
    if (!allowed.has(name)) return arg;
    if (!valueOptions.has(name)) continue;
    if (arg.includes("=")) {
      if (arg.slice(arg.indexOf("=") + 1).length === 0) return arg;
      continue;
    }

    const value = commandArgs[index + 1];
    if (!value || value.startsWith("-")) return arg;
    index += 1;
  }
  return undefined;
}

export function renderCodeHelp(stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout): void {
  stdout.write(formatCodeHelp());
}

export function tryHandleCodeHelp(
  argv: readonly string[],
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout,
): boolean {
  if (!isCodeHelpInvocation(argv)) return false;
  renderCodeHelp(stdout);
  return true;
}

export function formatCodeHelp(): string {
  const rows = CODE_HELP_OPTION_ROWS.map(
    ({ flag, description }) => `  ${flag.padEnd(CODE_HELP_FLAG_WIDTH)} ${description}`,
  ).join("\n");
  return `Appaloft code

${cliCommandDescriptions.agentScratch}

Usage:
  appaloft code [path|git-remote] [options]

Options:
${rows}
`;
}
