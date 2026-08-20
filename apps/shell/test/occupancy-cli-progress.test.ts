import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  occupancyCliCommand,
  occupancyCliStartupProgress,
  SHELL_OCCUPANCY_PROGRESS,
  shouldExitAfterOccupancyCodeCli,
  shouldKeepOccupancyCliLogs,
  shouldPrintOccupancyLineProgress,
  shouldSkipLocalPgliteForOccupancyCli,
  shouldWarmOccupancyTui,
} from "../src/occupancy-cli-progress";

describe("occupancy CLI shell progress", () => {
  test("[WS-REMOTE-PROGRESS-191] remote code skips local PGlite and keeps logs", () => {
    const args = ["code", "--no-attach"];
    expect(occupancyCliCommand(args)).toBe("code");
    expect(occupancyCliStartupProgress(args)).toBe(SHELL_OCCUPANCY_PROGRESS.openingRemoteSession);
    expect(shouldSkipLocalPgliteForOccupancyCli(args)).toBeTrue();
    expect(shouldKeepOccupancyCliLogs(args)).toBeTrue();
    expect(shouldExitAfterOccupancyCodeCli(args)).toBeTrue();
    expect(
      shouldPrintOccupancyLineProgress(args, { stdin: { isTTY: true }, stdout: { isTTY: true } }),
    ).toBeTrue();
  });

  test("[WS-REMOTE-PROGRESS-193] TTY code and workspace skip streamed line progress", () => {
    const tty = { stdin: { isTTY: true }, stdout: { isTTY: true } };
    expect(shouldPrintOccupancyLineProgress(["code"], tty)).toBeFalse();
    expect(shouldPrintOccupancyLineProgress(["workspace"], tty)).toBeFalse();
    expect(shouldPrintOccupancyLineProgress(["code", "--no-attach"], tty)).toBeTrue();
    expect(shouldPrintOccupancyLineProgress(["code"], { stdin: {}, stdout: {} })).toBeTrue();
  });

  test("[WS-REMOTE-PROGRESS-191] workspace keeps logs and does not skip PGlite", () => {
    const args = ["workspace", "--json"];
    expect(occupancyCliCommand(args)).toBe("workspace");
    expect(occupancyCliStartupProgress(args)).toBe(SHELL_OCCUPANCY_PROGRESS.openingRemoteSession);
    expect(shouldSkipLocalPgliteForOccupancyCli(args)).toBeFalse();
    expect(shouldKeepOccupancyCliLogs(args)).toBeTrue();
  });

  test("[WS-REMOTE-PROGRESS-191] --local scratch does not skip PGlite and still announces", () => {
    const args = ["code", "--local"];
    expect(occupancyCliCommand(args)).toBe("code-local");
    expect(occupancyCliStartupProgress(args)).toBe(SHELL_OCCUPANCY_PROGRESS.openingScratchSession);
    expect(shouldSkipLocalPgliteForOccupancyCli(args)).toBeFalse();
    expect(shouldKeepOccupancyCliLogs(args)).toBeTrue();
  });

  test("[WS-REMOTE-PROGRESS-191] shell entry reports progress before importing run.ts", () => {
    const source = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    const startupCall = source.indexOf("reportOccupancyCliStartupOnce");
    const runImport = source.indexOf('import("./run")');
    expect(startupCall).toBeGreaterThan(-1);
    expect(runImport).toBeGreaterThan(-1);
    expect(startupCall).toBeLessThan(runImport);
  });

  test("[WS-REMOTE-PROGRESS-197] TTY occupancy warms the TUI before importing run.ts", () => {
    const tty = { stdin: { isTTY: true }, stdout: { isTTY: true } };
    expect(shouldWarmOccupancyTui(["code"], tty)).toBeTrue();
    expect(shouldWarmOccupancyTui(["workspace"], tty)).toBeTrue();
    expect(shouldWarmOccupancyTui(["code", "--no-attach"], tty)).toBeFalse();
    const source = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    const warmup = source.indexOf("warmupWorkspaceControlRenderer");
    const runImport = source.indexOf('import("./run")');
    expect(warmup).toBeGreaterThan(-1);
    expect(runImport).toBeGreaterThan(-1);
    expect(warmup).toBeLessThan(runImport);
  });
});
