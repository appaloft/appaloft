import { writeSync } from "node:fs";

export const OCCUPANCY_ALT_SCREEN = "\x1b[?1049h";
export const OCCUPANCY_LEAVE_ALT_SCREEN = "\x1b[?25h\x1b[?1049l";
export const OCCUPANCY_DISABLE_MOUSE = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";
export const OCCUPANCY_FIRST_FRAME_CHROME = "Appaloft Cloud Agents";
export const OCCUPANCY_FIRST_FRAME_TITLE = "preparing the agent";
export const OCCUPANCY_FIRST_FRAME_SPINNER = "⠋";
export const OCCUPANCY_FIRST_FRAME_STEPS = [
  "Checking login",
  "Preparing skills",
  "Preparing disk",
] as const;

let occupancyAltScreenEntered = false;
let occupancyAltScreenRestoreInstalled = false;
let occupancyWarmupInterruptInstalled = false;
let occupancyWarmupSigint: (() => void) | undefined;
let occupancyWarmupSigterm: (() => void) | undefined;

export const OCCUPANCY_RENDERER_OWNED = Symbol.for("appaloft.occupancyRendererOwned");

// Bun's Process.on only types memoryPressure; warmup still uses POSIX signals.
type OccupancySignalProcess = {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): void;
};

function occupancySignalProcess(): OccupancySignalProcess {
  return process as unknown as OccupancySignalProcess;
}

export function occupancyRendererOwnsTerminal(): boolean {
  return Boolean(
    (process as NodeJS.Process & { [key: symbol]: unknown })[OCCUPANCY_RENDERER_OWNED],
  );
}
export function isErrnoEpipe(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "EPIPE",
  );
}

export function writeOccupancyTerminalBytes(write: (text: string) => void, text: string): void {
  try {
    write(text);
  } catch (error) {
    if (!isErrnoEpipe(error)) throw error;
  }
}

export function occupancyFirstFrameChromeForWidth(cols = 80): string {
  const max = Math.max(1, Math.floor(cols));
  if (OCCUPANCY_FIRST_FRAME_CHROME.length <= max) return OCCUPANCY_FIRST_FRAME_CHROME;
  let fitted = "";
  for (const word of OCCUPANCY_FIRST_FRAME_CHROME.split(" ")) {
    const next = fitted ? `${fitted} ${word}` : word;
    if (next.length > max) break;
    fitted = next;
  }
  return fitted;
}

export function occupancyFirstFrameWaitPanel(cols = 80): string {
  const inner = [
    `${OCCUPANCY_FIRST_FRAME_SPINNER} ${OCCUPANCY_FIRST_FRAME_TITLE}`,
    "",
    ...OCCUPANCY_FIRST_FRAME_STEPS.map((label) => `  ${label}`),
  ];
  const maxInner = Math.max(...inner.map((line) => line.length));
  const innerW = Math.max(
    8,
    Math.min(Math.max(maxInner + 2, 22), Math.max(8, Math.floor(cols)) - 2),
  );
  const boxW = innerW + 2;
  const left = " ".repeat(Math.max(0, Math.floor((Math.floor(cols) - boxW) / 2)));
  const top = `${left}╭${"─".repeat(innerW)}╮`;
  const bot = `${left}╰${"─".repeat(innerW)}╯`;
  const mid = inner.map((line) => {
    const clipped = line.length > innerW ? line.slice(0, innerW) : line;
    return `${left}│${clipped.padEnd(innerW)}│`;
  });
  return [top, ...mid, bot].join("\r\n");
}

export function occupancyFirstFrameBytes(rows = 24, cols = 80): string {
  const title = occupancyFirstFrameChromeForWidth(cols);
  const panel = occupancyFirstFrameWaitPanel(cols);
  const panelLines = panel.split("\r\n").length;
  const topPad = Math.max(0, Math.floor((Math.max(1, Math.floor(rows) - 1) - panelLines) / 2));
  const padded = [title, ...Array.from({ length: topPad }, () => ""), panel].join("\r\n");
  return `${OCCUPANCY_ALT_SCREEN}\x1b[?25l\x1b[2J\x1b[H${padded}`;
}

export function occupancyAltScreenWasEntered(): boolean {
  return occupancyAltScreenEntered;
}

export function resetOccupancyAltScreenState(): void {
  occupancyAltScreenEntered = false;
  delete (process as NodeJS.Process & { [key: symbol]: unknown })[OCCUPANCY_RENDERER_OWNED];
  releaseOccupancyWarmupInterrupt();
}

export function releaseOccupancyWarmupInterrupt(): void {
  const nodeProcess = occupancySignalProcess();
  if (occupancyWarmupSigint) {
    nodeProcess.off("SIGINT", occupancyWarmupSigint);
    occupancyWarmupSigint = undefined;
  }
  if (occupancyWarmupSigterm) {
    nodeProcess.off("SIGTERM", occupancyWarmupSigterm);
    occupancyWarmupSigterm = undefined;
  }
  occupancyWarmupInterruptInstalled = false;
}

export function markOccupancyRendererOwnsTerminal(): void {
  (process as NodeJS.Process & { [key: symbol]: unknown })[OCCUPANCY_RENDERER_OWNED] = true;
  occupancyAltScreenEntered = false;
  releaseOccupancyWarmupInterrupt();
}

function installOccupancyWarmupInterrupt(write: (text: string) => void): void {
  if (occupancyWarmupInterruptInstalled) return;
  occupancyWarmupInterruptInstalled = true;
  const restoreAndExit = (code: number) => {
    if (occupancyRendererOwnsTerminal()) return;
    writeOccupancyTerminalBytes(write, `${OCCUPANCY_LEAVE_ALT_SCREEN}${OCCUPANCY_DISABLE_MOUSE}\n`);
    occupancyAltScreenEntered = false;
    process.exit(code);
  };
  occupancyWarmupSigint = () => {
    restoreAndExit(130);
  };
  occupancyWarmupSigterm = () => {
    restoreAndExit(143);
  };
  const nodeProcess = occupancySignalProcess();
  nodeProcess.on("SIGINT", occupancyWarmupSigint);
  nodeProcess.on("SIGTERM", occupancyWarmupSigterm);
}

export function enterOccupancyAltScreen(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
  size: { readonly rows?: number; readonly columns?: number } = process.stdout,
): void {
  occupancyAltScreenEntered = true;
  installOccupancyWarmupInterrupt(write);
  writeOccupancyTerminalBytes(write, occupancyFirstFrameBytes(size.rows ?? 24, size.columns ?? 80));
}

export function leaveOccupancyAltScreen(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
): void {
  occupancyAltScreenEntered = false;
  writeOccupancyTerminalBytes(write, `${OCCUPANCY_LEAVE_ALT_SCREEN}${OCCUPANCY_DISABLE_MOUSE}\n`);
}

export function restoreOccupancyAltScreenIfEntered(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
): boolean {
  if (!occupancyAltScreenEntered) return false;
  leaveOccupancyAltScreen(write);
  return true;
}

export function installOccupancyAltScreenRestore(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
): void {
  if (occupancyAltScreenRestoreInstalled) return;
  occupancyAltScreenRestoreInstalled = true;
  process.on("exit", () => {
    if (occupancyRendererOwnsTerminal()) return;
    restoreOccupancyAltScreenIfEntered(write);
  });
}

export function ignoreOccupancyTerminalEpipe(error: NodeJS.ErrnoException): void {
  if (error.code === "EPIPE") return;
}

export function exitQuietlyOnOccupancyEpipe(error: unknown): void {
  if (!isErrnoEpipe(error)) throw error;
  restoreOccupancyAltScreenIfEntered();
  process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
}
