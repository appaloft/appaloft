export const COMMUNITY_OCCUPANCY_CODEX_VERSION = "0.149.0";
export const COMMUNITY_OCCUPANCY_CODEX_PACKAGE = "@openai/codex";
export const COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE = "opencode-ai";
export const COMMUNITY_OCCUPANCY_CLAUDE_VERSION = "2.1.199";
export const COMMUNITY_OCCUPANCY_CLAUDE_PACKAGE = "@anthropic-ai/claude-code";
export const COMMUNITY_OCCUPANCY_GROK_VERSION = "1.0.5";
export const COMMUNITY_OCCUPANCY_GROK_INSTALL_URL = "https://x.ai/cli/install.sh";
export const COMMUNITY_OCCUPANCY_GROK_BIN = "/workspace/.grok/bin/grok";

export function occupancyHarnessInstallArgv(input: {
  readonly packageName: string;
  readonly version: string;
}): readonly string[] {
  return ["bun", "add", "--global", "--exact", "--trust", `${input.packageName}@${input.version}`];
}

export function occupancyGrokInstallArgv(
  version: string = COMMUNITY_OCCUPANCY_GROK_VERSION,
): readonly string[] {
  return [
    "sh",
    "-c",
    `curl -fsSL ${COMMUNITY_OCCUPANCY_GROK_INSTALL_URL} -o /tmp/appaloft-grok-install.sh && sh /tmp/appaloft-grok-install.sh ${version} && ln -sfn ${COMMUNITY_OCCUPANCY_GROK_BIN} /usr/local/bin/grok`,
  ];
}
