import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  folderHasPersistedProjectLink,
  occupancyCliCommand,
  occupancyCliStartupProgress,
  occupancyCodeSkipsFolderInquire,
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

  test("[MW-CP-NO-RECOVERY-011][WS-REMOTE-PROGRESS-191] workspace keeps logs and skips PGlite", () => {
    const args = ["workspace", "--json"];
    expect(occupancyCliCommand(args)).toBe("workspace");
    expect(occupancyCliStartupProgress(args)).toBe(SHELL_OCCUPANCY_PROGRESS.openingRemoteSession);
    expect(shouldSkipLocalPgliteForOccupancyCli(args)).toBeTrue();
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

  test("[FOLDER-ONBOARD-009][WS-REMOTE-PROGRESS-197] unlinked TTY code does not warm alt-screen before inquire", () => {
    const tty = { stdin: { isTTY: true }, stdout: { isTTY: true } };
    expect(occupancyCodeSkipsFolderInquire(["code"])).toBeFalse();
    expect(occupancyCodeSkipsFolderInquire(["code", "--yes"])).toBeTrue();
    expect(occupancyCodeSkipsFolderInquire(["code", "-y"])).toBeTrue();
    expect(shouldWarmOccupancyTui(["code"], tty, { folderLinked: false })).toBeFalse();
    expect(shouldWarmOccupancyTui(["code", "--yes"], tty, { folderLinked: false })).toBeTrue();
    expect(shouldWarmOccupancyTui(["code"], tty, { folderLinked: true })).toBeTrue();
    expect(
      folderHasPersistedProjectLink("/tmp/missing-folder-link", {
        APPALOFT_HOME: "/tmp/missing-appaloft-home",
      }),
    ).toBeFalse();
  });

  test("[WS-REMOTE-PROGRESS-197] TTY occupancy warms the TUI before importing run.ts", () => {
    const tty = { stdin: { isTTY: true }, stdout: { isTTY: true } };
    expect(shouldWarmOccupancyTui(["code"], tty, { folderLinked: true })).toBeTrue();
    expect(shouldWarmOccupancyTui(["workspace"], tty)).toBeTrue();
    expect(
      shouldWarmOccupancyTui(["code", "--no-attach"], tty, { folderLinked: true }),
    ).toBeFalse();
    expect(shouldWarmOccupancyTui(["code", "--help"], tty, { folderLinked: true })).toBeFalse();
    expect(shouldWarmOccupancyTui(["code", "-h"], tty, { folderLinked: true })).toBeFalse();
    expect(shouldWarmOccupancyTui(["workspace", "--help"], tty)).toBeFalse();
    const source = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    const firstFrame = source.indexOf("enterOccupancyAltScreen()");
    const warmup = source.indexOf("warmupWorkspaceControlRenderer");
    const reflectImport = source.indexOf('import("reflect-metadata")');
    const runImport = source.indexOf('import("./run")');
    expect(firstFrame).toBeGreaterThan(-1);
    expect(warmup).toBeGreaterThan(-1);
    expect(reflectImport).toBeGreaterThan(-1);
    expect(runImport).toBeGreaterThan(-1);
    expect(firstFrame).toBeLessThan(warmup);
    expect(warmup).toBeLessThan(reflectImport);
    expect(warmup).toBeLessThan(runImport);
    expect(source).toContain("@appaloft/adapter-cli/workspace-tui-launch");
    expect(source).not.toContain("@appaloft/adapter-cli/workspace-control-renderer");
    expect(source).not.toMatch(/^import ["']reflect-metadata["']/m);
  });

  test("[WS-REMOTE-PROGRESS-202] occupancy TUI launch stays off composition imports", () => {
    const launch = readFileSync(
      join(import.meta.dir, "../../../packages/adapters/cli/src/workspace-tui-launch.ts"),
      "utf8",
    );
    expect(launch).not.toContain("@appaloft/application");
    expect(launch).not.toContain("@appaloft/core");
    expect(launch).not.toContain("workspace-control-presentation");
    expect(launch).not.toContain("operate-presentation");
    expect(launch).not.toContain("reflect-metadata");
    const shell = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    expect(shell.indexOf("enterOccupancyAltScreen()")).toBeLessThan(
      shell.indexOf("@appaloft/adapter-cli/workspace-tui-launch"),
    );
    expect(shell.indexOf("warmupWorkspaceControlRenderer")).toBeLessThan(
      shell.indexOf('import("reflect-metadata")'),
    );
  });
});
