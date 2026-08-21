export const SETUP_AGENT_LIST = ["universal", "claude-code", "cursor", "opencode"] as const;

export const SETUP_AGENT_OPTION_DESCRIPTIONS = {
  yes: "Skip prompts and accept detected defaults.",
  agent: `Target a specific agent instead of defaults (repeatable): ${SETUP_AGENT_LIST.join(", ")}.`,
  profile: "CLI profile to launch with remote-stdio (defaults to the active profile).",
  cursorHome: "Cursor home directory (defaults to ~/.cursor).",
  opencodeHome: "OpenCode config directory (defaults to ~/.config/opencode).",
  agentsHome: "Shared skills directory (defaults to ~/.agents).",
  claudeHome: "Claude Code home directory (defaults to ~/.claude).",
  command: "Launcher command (defaults to appaloft).",
  skillDir: "Skill source directory (defaults to packaged skills/appaloft).",
  help: "Show this help.",
} as const;

const SETUP_HELP_OPTION_ROWS: readonly {
  readonly flag: string;
  readonly description: string;
}[] = [
  { flag: "-y, --yes", description: SETUP_AGENT_OPTION_DESCRIPTIONS.yes },
  { flag: "--agent <name>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.agent },
  { flag: "--profile <name>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.profile },
  { flag: "--cursor-home <path>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.cursorHome },
  { flag: "--opencode-home <path>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.opencodeHome },
  { flag: "--agents-home <path>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.agentsHome },
  { flag: "--claude-home <path>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.claudeHome },
  { flag: "--command <command>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.command },
  { flag: "--skill-dir <path>", description: SETUP_AGENT_OPTION_DESCRIPTIONS.skillDir },
  { flag: "--help, -h", description: SETUP_AGENT_OPTION_DESCRIPTIONS.help },
];

const SETUP_HELP_FLAG_WIDTH = 24;

function cliUserArgs(argv: readonly string[]): readonly string[] {
  const afterRuntime = argv.slice(2).filter((arg) => arg !== "--");
  return afterRuntime[0] === "appaloft" ? afterRuntime.slice(1) : afterRuntime;
}

export function isSetupHelpInvocation(argv: readonly string[]): boolean {
  const args = cliUserArgs(argv);
  return args[0] === "setup" && (args.includes("--help") || args.includes("-h"));
}

export function formatSetupHelp(): string {
  const rows = SETUP_HELP_OPTION_ROWS.map(
    ({ flag, description }) => `  ${flag.padEnd(SETUP_HELP_FLAG_WIDTH)} ${description}`,
  ).join("\n");
  return `Appaloft agent setup

Usage:
  appaloft setup agent [-y] [--agent <name>] [--profile <name>] [--cursor-home <path>] [--opencode-home <path>] [--agents-home <path>] [--claude-home <path>] [--command <command>] [--skill-dir <path>]

Default-checks universal (~/.agents), Claude Code when ~/.claude exists, and Cursor when ~/.cursor exists. OpenCode is on the agent list (${SETUP_AGENT_LIST.join(", ")}) but is not default-checked; pass --agent opencode or use the sibling install commands. Skills are byte-identical copies. MCP reuses appaloft login through remote-stdio: Cursor ~/.cursor/mcp.json and Claude ~/.claude.json. Universal is skills only. Tokens stay in the Appaloft CLI profile store, not in editor config. -y accepts those defaults and skips already-installed skill/MCP entries.

Options:
${rows}
`;
}

export function renderSetupHelp(stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout): void {
  stdout.write(formatSetupHelp());
}

export function tryHandleSetupHelp(
  argv: readonly string[],
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout,
): boolean {
  if (!isSetupHelpInvocation(argv)) return false;
  renderSetupHelp(stdout);
  return true;
}
