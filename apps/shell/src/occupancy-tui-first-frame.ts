import { writeSync } from "node:fs";

export const OCCUPANCY_ALT_SCREEN = "\x1b[?1049h";
export const OCCUPANCY_LEAVE_ALT_SCREEN = "\x1b[?25h\x1b[?1049l";
export const OCCUPANCY_DISABLE_MOUSE = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";
export const OCCUPANCY_FIRST_FRAME_CHROME = "Appaloft Cloud Agents";
export const OCCUPANCY_FIRST_FRAME_TITLE = "preparing the agent";

let occupancyAltScreenEntered = false;
let occupancyAltScreenRestoreInstalled = false;

export function occupancyFirstFrameBytes(rows = 24, cols = 80): string {
  const titleRow = Math.max(1, Math.floor(rows / 2) - 1);
  const waitRow = titleRow + 1;
  const titleCol = Math.max(1, Math.floor((cols - OCCUPANCY_FIRST_FRAME_CHROME.length) / 2) + 1);
  const waitCol = Math.max(1, Math.floor((cols - OCCUPANCY_FIRST_FRAME_TITLE.length) / 2) + 1);
  return `${OCCUPANCY_ALT_SCREEN}\x1b[?25l\x1b[2J\x1b[H\x1b[${titleRow};${titleCol}H${OCCUPANCY_FIRST_FRAME_CHROME}\x1b[${waitRow};${waitCol}H${OCCUPANCY_FIRST_FRAME_TITLE}`;
}

export function occupancyAltScreenWasEntered(): boolean {
  return occupancyAltScreenEntered;
}

export function resetOccupancyAltScreenState(): void {
  occupancyAltScreenEntered = false;
}

export function enterOccupancyAltScreen(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
  size: { readonly rows?: number; readonly columns?: number } = process.stdout,
): void {
  occupancyAltScreenEntered = true;
  write(occupancyFirstFrameBytes(size.rows ?? 24, size.columns ?? 80));
}

export function leaveOccupancyAltScreen(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
): void {
  occupancyAltScreenEntered = false;
  write(`${OCCUPANCY_LEAVE_ALT_SCREEN}${OCCUPANCY_DISABLE_MOUSE}\n`);
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
    restoreOccupancyAltScreenIfEntered(write);
  });
}
