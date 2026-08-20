import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enterOccupancyAltScreen,
  leaveOccupancyAltScreen,
  OCCUPANCY_ALT_SCREEN,
  OCCUPANCY_DISABLE_MOUSE,
  OCCUPANCY_FIRST_FRAME_CHROME,
  OCCUPANCY_FIRST_FRAME_TITLE,
  OCCUPANCY_LEAVE_ALT_SCREEN,
  occupancyAltScreenWasEntered,
  occupancyFirstFrameBytes,
  resetOccupancyAltScreenState,
  restoreOccupancyAltScreenIfEntered,
} from "../src/occupancy-tui-first-frame";

describe("occupancy TUI first frame", () => {
  afterEach(() => {
    resetOccupancyAltScreenState();
  });

  test("[WS-REMOTE-PROGRESS-203] parent alt-screen is occupancy preparing chrome", () => {
    const frame = occupancyFirstFrameBytes(24, 80);
    expect(frame.startsWith(OCCUPANCY_ALT_SCREEN)).toBeTrue();
    expect(frame).toContain(OCCUPANCY_FIRST_FRAME_CHROME);
    expect(frame).toContain(OCCUPANCY_FIRST_FRAME_TITLE);
    expect(frame).not.toMatch(/occupancy/iu);
    let written = "";
    enterOccupancyAltScreen((text) => {
      written = text;
    });
    expect(written.startsWith(OCCUPANCY_ALT_SCREEN)).toBeTrue();
    expect(written).toContain(OCCUPANCY_FIRST_FRAME_CHROME);
    expect(written).toContain(OCCUPANCY_FIRST_FRAME_TITLE);
    expect(written).not.toMatch(/occupancy/iu);
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

  test("[WS-REMOTE-PROGRESS-203] workspace warms Cloud Agents alt-screen; code inquires first", () => {
    const source = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    const progress = readFileSync(
      join(import.meta.dir, "../src/occupancy-cli-progress.ts"),
      "utf8",
    );
    const firstFrame = source.indexOf("enterOccupancyAltScreen()");
    const launchImport = source.indexOf("@appaloft/adapter-cli/workspace-tui-launch");
    const reflectImport = source.indexOf('import("reflect-metadata")');
    const runImport = source.indexOf('import("./run")');
    const barrel = source.search(/import\("@appaloft\/adapter-cli"\)/);
    const codeHelp = source.indexOf("@appaloft/adapter-cli/code-help");
    const helpGate = source.indexOf('command === "code" && isHelpFlag(args)');
    const warmGate = source.indexOf("shouldWarmOccupancyTui(args)");
    const leaveOnWarmupFail = source.indexOf("leaveOccupancyAltScreen()");
    expect(firstFrame).toBeGreaterThan(-1);
    expect(codeHelp).toBeGreaterThan(-1);
    expect(helpGate).toBeGreaterThan(-1);
    expect(helpGate).toBeLessThan(firstFrame);
    expect(codeHelp).toBeLessThan(firstFrame);
    expect(warmGate).toBeGreaterThan(-1);
    expect(warmGate).toBeLessThan(firstFrame);
    expect(launchImport).toBeGreaterThan(firstFrame);
    expect(reflectImport).toBeGreaterThan(firstFrame);
    expect(runImport).toBeGreaterThan(firstFrame);
    expect(barrel).toBeGreaterThan(firstFrame);
    expect(source).toContain("installOccupancyAltScreenRestore");
    expect(source).toContain("restoreOccupancyAltScreenIfEntered");
    expect(source.indexOf("installOccupancyAltScreenRestore()")).toBeLessThan(firstFrame);
    expect(leaveOnWarmupFail).toBeGreaterThan(firstFrame);
    expect(leaveOnWarmupFail).toBeLessThan(
      source.indexOf("process.stderr.write", leaveOnWarmupFail),
    );
    expect(progress).toContain('if (command !== "workspace") return false');
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

  test("[WS-REMOTE-HELP-218] leaveOccupancyAltScreen restores cursor and alt-screen", () => {
    let written = "";
    leaveOccupancyAltScreen((text) => {
      written = text;
    });
    expect(written).toContain(OCCUPANCY_LEAVE_ALT_SCREEN);
    expect(written).toContain("\x1b[?25h");
    expect(written).toContain("\x1b[?1049l");
    expect(written).toContain(OCCUPANCY_DISABLE_MOUSE);
  });

  test("[WS-REMOTE-HELP-218] teardown emits leave only when alt-screen was entered", () => {
    let written = "";
    expect(occupancyAltScreenWasEntered()).toBeFalse();
    expect(
      restoreOccupancyAltScreenIfEntered((text) => {
        written += text;
      }),
    ).toBeFalse();
    expect(written).toBe("");

    enterOccupancyAltScreen((text) => {
      expect(text).toContain(OCCUPANCY_ALT_SCREEN);
    });
    expect(occupancyAltScreenWasEntered()).toBeTrue();
    expect(
      restoreOccupancyAltScreenIfEntered((text) => {
        written += text;
      }),
    ).toBeTrue();
    expect(written).toContain(OCCUPANCY_LEAVE_ALT_SCREEN);
    expect(occupancyAltScreenWasEntered()).toBeFalse();
    written = "";
    expect(
      restoreOccupancyAltScreenIfEntered((text) => {
        written += text;
      }),
    ).toBeFalse();
    expect(written).toBe("");
  });
});
