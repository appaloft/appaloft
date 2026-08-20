import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  occupancyCliCommand,
  occupancyCliStartupProgress,
  SHELL_OCCUPANCY_PROGRESS,
  shouldExitAfterOccupancyCodeCli,
  shouldKeepOccupancyCliLogs,
  shouldSkipLocalPgliteForOccupancyCli,
} from "../src/occupancy-cli-progress";

describe("occupancy CLI shell progress", () => {
  test("[WS-REMOTE-PROGRESS-191] remote code skips local PGlite and keeps logs", () => {
    const args = ["code", "--no-attach"];
    expect(occupancyCliCommand(args)).toBe("code");
    expect(occupancyCliStartupProgress(args)).toBe(SHELL_OCCUPANCY_PROGRESS.openingRemoteSession);
    expect(shouldSkipLocalPgliteForOccupancyCli(args)).toBeTrue();
    expect(shouldKeepOccupancyCliLogs(args)).toBeTrue();
    expect(shouldExitAfterOccupancyCodeCli(args)).toBeTrue();
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
});
