import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enterOccupancyAltScreen,
  OCCUPANCY_ALT_SCREEN,
  OCCUPANCY_FIRST_FRAME_TITLE,
  occupancyFirstFrameBytes,
} from "../src/occupancy-tui-first-frame";

describe("occupancy TUI first frame", () => {
  test("[WS-REMOTE-PROGRESS-203] parent alt-screen is occupancy preparing chrome", () => {
    const frame = occupancyFirstFrameBytes(24, 80);
    expect(frame.startsWith(OCCUPANCY_ALT_SCREEN)).toBeTrue();
    expect(frame).toContain(OCCUPANCY_FIRST_FRAME_TITLE);
    let written = "";
    enterOccupancyAltScreen((text) => {
      written = text;
    });
    expect(written.startsWith(OCCUPANCY_ALT_SCREEN)).toBeTrue();
    expect(written).toContain(OCCUPANCY_FIRST_FRAME_TITLE);
  });

  test("[WS-REMOTE-PROGRESS-203] first occupancy alt-screen is written in-process under 1s", () => {
    const started = performance.now();
    let written = "";
    enterOccupancyAltScreen((text) => {
      written = text;
    });
    expect(written.startsWith(OCCUPANCY_ALT_SCREEN)).toBeTrue();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("[WS-REMOTE-PROGRESS-203] TTY code enters alt-screen before sidecar lookup", () => {
    const source = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    const firstFrame = source.indexOf("enterOccupancyAltScreen()");
    const launchImport = source.indexOf("@appaloft/adapter-cli/workspace-tui-launch");
    const reflectImport = source.indexOf('import("reflect-metadata")');
    const runImport = source.indexOf('import("./run")');
    const barrel = source.indexOf('import("@appaloft/adapter-cli")');
    expect(firstFrame).toBeGreaterThan(-1);
    expect(launchImport).toBeGreaterThan(firstFrame);
    expect(reflectImport).toBeGreaterThan(firstFrame);
    expect(runImport).toBeGreaterThan(firstFrame);
    expect(barrel).toBeGreaterThan(firstFrame);
    expect(source).not.toMatch(/^import .*workspace-tui-launch/m);
    expect(source).not.toContain("workspace-control-renderer");
    const firstFrameModule = readFileSync(
      join(import.meta.dir, "../src/occupancy-tui-first-frame.ts"),
      "utf8",
    );
    expect(firstFrameModule).not.toContain("@appaloft/");
    expect(firstFrameModule).not.toContain("workspace-tui-launch");
    expect(firstFrameModule).not.toContain("ensureWorkspaceControlRendererBinary");
    expect(firstFrameModule).not.toContain("resolveWorkspaceControlRendererBinary");
  });
});
