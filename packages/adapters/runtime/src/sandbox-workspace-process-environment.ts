export const sandboxWorkspaceProcessEnvironment = Object.freeze([
  "HOME=/workspace",
  "XDG_DATA_HOME=/workspace/.local/share",
  "XDG_CONFIG_HOME=/workspace/.config",
  "XDG_STATE_HOME=/workspace/.local/state",
  "XDG_CACHE_HOME=/workspace/.cache",
]);

export function sandboxWorkspaceProcessArgv(argv: readonly string[]): string[] {
  return ["env", ...sandboxWorkspaceProcessEnvironment, ...argv];
}
