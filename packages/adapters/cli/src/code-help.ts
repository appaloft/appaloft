import { cliCommandDescriptions } from "./commands/docs-help.js";

export const EFFECT_HELP_GENERIC_BOOLEAN = "A true or false value";
export const EFFECT_HELP_GENERIC_TEXT = "A user-defined piece of text";
export const EFFECT_HELP_OPTIONAL_PROSE = "This setting is optional";

export const CODE_OPTION_DESCRIPTIONS = {
  path: "Local path or git remote to occupy, defaulting to this directory; a git remote occupies that repo without cloning it here.",
  noAttach: "Occupy the Sandbox and print the banner without attaching the agent TUI.",
  local:
    "Open this-Mac scratch instead of occupying a remote Sandbox; rejects a git-remote locator.",
  forceNew: "Start a new isolated Workspace instead of resuming the live occupancy.",
  yes: "Skip folder-onboarding prompts and create a project named after this directory.",
  open: "After occupy, print and open the default preview, pull request, or compare URL.",
  openTarget: "Choose which URL --open uses: preview, production, pr, compare, or connections.",
  profile:
    "Pin an Agent Workspace Profile name or installation id; default OpenCode omits this so the live occupancy can resume.",
  server: "Place the Sandbox on this registered BYOS Server id, defaulting to the enrolled Server.",
  opencode: "Use the OpenCode harness.",
  pi: "Use the Pi harness.",
  omp: "Use the OMP harness.",
  claude: "Use the Claude setup-token already on this laptop.",
  codex: "Use ~/.codex/auth.json already on this laptop.",
  grok: "Use ~/.grok/auth.json already on this laptop.",
  harness:
    "Compatibility only. Prefer --opencode, --pi, or --omp. Cannot combine with a different agent alias.",
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
  { flag: "--harness opencode|pi|omp", description: CODE_OPTION_DESCRIPTIONS.harness },
  { flag: "--help, -h", description: CODE_OPTION_DESCRIPTIONS.help },
];

const CODE_HELP_FLAG_WIDTH = 54;

export function cliUserArgs(argv: readonly string[]): readonly string[] {
  const afterRuntime = argv.slice(2).filter((arg) => arg !== "--");
  return afterRuntime[0] === "appaloft" ? afterRuntime.slice(1) : afterRuntime;
}

export function isCodeHelpInvocation(argv: readonly string[]): boolean {
  const args = cliUserArgs(argv);
  return args[0] === "code" && (args.includes("--help") || args.includes("-h"));
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
