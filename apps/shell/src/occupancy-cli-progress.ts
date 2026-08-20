export const SHELL_OCCUPANCY_PROGRESS = {
  openingRemoteSession: "Opening remote session…",
  openingScratchSession: "Opening scratch session…",
} as const;

export function occupancyCliCommand(
  args: readonly string[],
): "code" | "workspace" | "code-local" | undefined {
  const command = args[0];
  if (command === "workspace") return "workspace";
  if (command !== "code") return undefined;
  return args.includes("--local") ? "code-local" : "code";
}

export function shouldSkipLocalPgliteForOccupancyCli(args: readonly string[]): boolean {
  return occupancyCliCommand(args) === "code";
}

export function shouldKeepOccupancyCliLogs(args: readonly string[]): boolean {
  const command = occupancyCliCommand(args);
  return command === "code" || command === "workspace" || command === "code-local";
}

export function occupancyCliStartupProgress(args: readonly string[]): string | undefined {
  const command = occupancyCliCommand(args);
  if (command === "code-local") return SHELL_OCCUPANCY_PROGRESS.openingScratchSession;
  if (command === "code" || command === "workspace") {
    return SHELL_OCCUPANCY_PROGRESS.openingRemoteSession;
  }
  return undefined;
}

export function reportOccupancyCliProgress(
  message: string,
  write: (text: string) => void = (text) => {
    process.stderr.write(text);
  },
): void {
  write(`${message}\n`);
}
