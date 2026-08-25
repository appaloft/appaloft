import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const SHELL_OCCUPANCY_PROGRESS = {
  openingRemoteSession: "Opening remote session…",
  openingScratchSession: "Opening scratch session…",
  loadingProject: "Loading your project",
} as const;

export function folderHasPersistedProjectLink(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const root = env.APPALOFT_HOME?.trim() || resolve(homedir(), ".appaloft");
  const storePath = resolve(root, "folder-links.json");
  if (!existsSync(storePath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as {
      readonly links?: Record<string, { readonly projectId?: unknown }>;
    };
    const link = parsed.links?.[resolve(cwd.trim() || ".")];
    return typeof link?.projectId === "string" && link.projectId.length > 0;
  } catch {
    return false;
  }
}

export function occupancyCodeSkipsFolderInquire(args: readonly string[]): boolean {
  return args.includes("--yes") || args.includes("-y");
}

export function shouldExitAfterOccupancyCodeCli(args: readonly string[]): boolean {
  const command = occupancyCliCommand(args);
  return command === "code" || command === "code-local";
}

export function isOccupancyHelpArgs(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h") || args[0] === "help";
}

export function shouldWarmOccupancyTui(
  args: readonly string[],
  io: {
    readonly stdin: { readonly isTTY?: boolean };
    readonly stdout: { readonly isTTY?: boolean };
  } = process,
  options: {
    readonly folderLinked?: boolean;
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): boolean {
  if (isOccupancyHelpArgs(args)) return false;
  const command = occupancyCliCommand(args);
  if (command !== "code" && command !== "workspace") return false;
  if (shouldPrintOccupancyLineProgress(args, io)) return false;
  if (command === "code" && !occupancyCodeSkipsFolderInquire(args)) {
    const linked =
      options.folderLinked ??
      folderHasPersistedProjectLink(options.cwd ?? process.cwd(), options.env ?? process.env);
    if (!linked) return false;
  }
  return true;
}

export function shouldPrintOccupancyLineProgress(
  args: readonly string[],
  io: {
    readonly stdin: { readonly isTTY?: boolean };
    readonly stdout: { readonly isTTY?: boolean };
  } = process,
): boolean {
  if (isOccupancyHelpArgs(args)) return false;
  const command = occupancyCliCommand(args);
  if (!command) return false;
  if (
    args.includes("--no-attach") ||
    args.includes("--json") ||
    args.includes("--no-tui") ||
    args.includes("--local")
  ) {
    return true;
  }
  return !io.stdin.isTTY || !io.stdout.isTTY;
}

export function occupancyCliCommand(
  args: readonly string[],
): "code" | "workspace" | "code-local" | undefined {
  const command = args[0];
  if (command === "workspace") return "workspace";
  if (command !== "code") return undefined;
  return args.includes("--local") ? "code-local" : "code";
}

export function shouldSkipLocalPgliteForOccupancyCli(args: readonly string[]): boolean {
  const command = occupancyCliCommand(args);
  return command === "code" || command === "workspace";
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

let occupancyStartupReported = false;

export function resetOccupancyCliStartupReport(): void {
  occupancyStartupReported = false;
}

export function reportOccupancyCliStartupOnce(
  args: readonly string[],
  write?: (message: string) => void,
): string | undefined {
  const message = occupancyCliStartupProgress(args);
  if (!message) return undefined;
  if (occupancyStartupReported) return message;
  occupancyStartupReported = true;
  if (write) write(message);
  else reportOccupancyCliProgress(message);
  return message;
}
