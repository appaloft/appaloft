export const COMMUNITY_OCCUPANCY_CODEX_VERSION = "0.149.0";
export const COMMUNITY_OCCUPANCY_CODEX_PACKAGE = "@openai/codex";
export const COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE = "opencode-ai";

export function occupancyHarnessInstallArgv(input: {
  readonly packageName: string;
  readonly version: string;
}): readonly string[] {
  return ["bun", "add", "--global", "--exact", "--trust", `${input.packageName}@${input.version}`];
}
