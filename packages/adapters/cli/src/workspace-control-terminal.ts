export interface WorkspaceHostTerminalClassification {
  readonly supported: boolean;
  readonly reason?: "platform-unsupported" | "terminal-unsupported";
}

export function classifyWorkspaceHostTerminal(
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): WorkspaceHostTerminalClassification {
  if (platform === "win32") return { supported: false, reason: "platform-unsupported" };
  const term = environment.TERM?.trim().toLowerCase();
  if (!term || term === "dumb" || term === "unknown") {
    return { supported: false, reason: "terminal-unsupported" };
  }
  return { supported: true };
}
