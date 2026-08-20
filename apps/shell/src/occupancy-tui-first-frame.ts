import { writeSync } from "node:fs";

export const OCCUPANCY_ALT_SCREEN = "\x1b[?1049h";
export const OCCUPANCY_FIRST_FRAME_TITLE = "preparing the agent";

export function occupancyFirstFrameBytes(rows = 24, cols = 80): string {
  const row = Math.max(1, Math.floor(rows / 2));
  const col = Math.max(1, Math.floor((cols - OCCUPANCY_FIRST_FRAME_TITLE.length) / 2) + 1);
  return `${OCCUPANCY_ALT_SCREEN}\x1b[?25l\x1b[2J\x1b[H\x1b[${row};${col}H${OCCUPANCY_FIRST_FRAME_TITLE}`;
}

export function enterOccupancyAltScreen(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
  size: { readonly rows?: number; readonly columns?: number } = process.stdout,
): void {
  write(occupancyFirstFrameBytes(size.rows ?? 24, size.columns ?? 80));
}

export function leaveOccupancyAltScreen(
  write: (text: string) => void = (text) => {
    writeSync(1, text);
  },
): void {
  write("\x1b[?25h\x1b[?1049l");
}
