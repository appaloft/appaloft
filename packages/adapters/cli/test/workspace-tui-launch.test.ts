import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resetWorkspaceControlRendererWarmup,
  resolveCodeWorkspaceControlRendererBinary,
  resolveWorkspaceControlRendererBinary,
  restoreWorkspaceTuiScrollback,
  sanitizeWorkspaceRendererFailureText,
  setWorkspaceTuiScrollbackWriter,
  WORKSPACE_CONTROL_TUI_BUILD_COMMAND,
  WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND,
  WORKSPACE_TUI_DISABLE_MOUSE,
  WORKSPACE_TUI_LEAVE_ALT_SCREEN,
  warmupWorkspaceControlRenderer,
  workspaceControlRendererSupportsCodeChrome,
  workspaceControlRendererUnavailableMessage,
} from "../src/workspace-tui-launch";

describe("occupancy TUI slim launch", () => {
  test("[WS-REMOTE-PROGRESS-202] launch module does not import composition", () => {
    const source = readFileSync(join(import.meta.dir, "../src/workspace-tui-launch.ts"), "utf8");
    expect(source).not.toContain("@appaloft/application");
    expect(source).not.toContain("@appaloft/core");
    expect(source).not.toContain("workspace-control-presentation");
    expect(source).not.toContain("operate-presentation");
    expect(source).not.toContain("reflect-metadata");
    const warmupAt = source.indexOf("export async function warmupWorkspaceControlRenderer");
    const chromeAt = source.indexOf(
      "resolveCodeWorkspaceControlRendererBinary(environment)",
      warmupAt,
    );
    const ensureAt = source.indexOf("ensureWorkspaceControlRendererBinary(environment)", warmupAt);
    expect(warmupAt).toBeGreaterThan(-1);
    expect(chromeAt).toBeGreaterThan(warmupAt);
    expect(ensureAt).toBe(-1);
    expect(source).toContain("binary-stale-chrome");
    expect(source).toContain("restoreWorkspaceTuiScrollback()");
    const rustcSpawn = source.indexOf('spawn(rustc, ["--version"]');
    const cargoSpawn = source.indexOf('spawn(cargo, ["build", "--locked"]');
    expect(source.slice(rustcSpawn, rustcSpawn + 180)).toContain(
      'stdio: ["ignore", "pipe", "pipe"]',
    );
    expect(source.slice(cargoSpawn, cargoSpawn + 220)).toContain(
      'stdio: ["ignore", "pipe", "pipe"]',
    );
  });

  test("[WS-REMOTE-PROGRESS-202] existing sidecar resolve does not need cargo or rustc", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join: joinPath } = await import("node:path");
    const workspace = await mkdtemp(joinPath(tmpdir(), "appaloft-tui-launch-"));
    const crate = joinPath(workspace, "apps", "workspace-control-tui");
    const binary = joinPath(crate, "target", "debug", "appaloft-workspace-tui");
    await mkdir(joinPath(crate, "target", "debug"), { recursive: true });
    await writeFile(joinPath(crate, "Cargo.toml"), '[package]\nname = "tui"\n');
    await writeFile(binary, "");
    try {
      expect(
        resolveWorkspaceControlRendererBinary({
          APPALOFT_REPO_ROOT: workspace,
          PATH: "",
          CARGO: "/workspace/.missing-cargo-must-not-run",
          RUSTC: "/workspace/.missing-rustc-must-not-run",
        }),
      ).toBe(binary);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-219] stale Occupancy renderer is not launched for code", async () => {
    const { chmod, mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join: joinPath } = await import("node:path");
    const workspace = await mkdtemp(joinPath(tmpdir(), "appaloft-stale-tui-"));
    const binDir = joinPath(workspace, "bin");
    const stale = joinPath(binDir, "appaloft-workspace-tui");
    const launched = joinPath(workspace, "launched");
    await mkdir(binDir, { recursive: true });
    await writeFile(stale, `#!/bin/sh\necho launched > "${launched}"\necho 'Occupancy'\nexit 1\n`);
    await chmod(stale, 0o755);
    try {
      expect(workspaceControlRendererSupportsCodeChrome(stale)).toBeFalse();
      expect(
        resolveWorkspaceControlRendererBinary({
          APPALOFT_WORKSPACE_TUI_BINARY: stale,
          PATH: "",
        }),
      ).toBe(stale);
      expect(
        resolveCodeWorkspaceControlRendererBinary({
          APPALOFT_WORKSPACE_TUI_BINARY: stale,
          PATH: "",
        }),
      ).toBeUndefined();
      const message = workspaceControlRendererUnavailableMessage({ codeChrome: true });
      expect(message).toContain("appaloft-workspace-tui");
      expect(message).toContain(WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND);
      expect(message).toContain(WORKSPACE_CONTROL_TUI_BUILD_COMMAND);
      expect(message).toContain("--no-attach");
      expect(message).not.toMatch(/occupancy/iu);
      expect(message).not.toContain("could not choose a version of cargo");
      resetWorkspaceControlRendererWarmup();
      await expect(
        warmupWorkspaceControlRenderer({
          APPALOFT_WORKSPACE_TUI_BINARY: stale,
          PATH: "",
        }),
      ).rejects.toMatchObject({
        details: { reason: "binary-stale-chrome" },
      });
      resetWorkspaceControlRendererWarmup();
      const { existsSync } = await import("node:fs");
      expect(existsSync(launched)).toBeFalse();
    } finally {
      resetWorkspaceControlRendererWarmup();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-219] rustup-missing restores TTY before cargo and does not spawn", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join: joinPath } = await import("node:path");
    const { ensureWorkspaceControlRendererBinary } = await import("../src/workspace-tui-launch");
    const root = await mkdtemp(joinPath(tmpdir(), "appaloft-rustup-missing-"));
    const crate = joinPath(root, "apps", "workspace-control-tui");
    await mkdir(crate, { recursive: true });
    await writeFile(joinPath(crate, "Cargo.toml"), '[package]\nname = "tui"\n');
    const events: string[] = [];
    let built = 0;
    resetWorkspaceControlRendererWarmup();
    setWorkspaceTuiScrollbackWriter((text) => {
      events.push(`leave:${text.includes(WORKSPACE_TUI_LEAVE_ALT_SCREEN) ? "yes" : "no"}`);
    });
    try {
      await expect(
        ensureWorkspaceControlRendererBinary(
          { APPALOFT_REPO_ROOT: root, PATH: "" },
          async () => {
            events.push("cargo");
            built += 1;
          },
          { rustcVersion: "" },
        ),
      ).rejects.toMatchObject({
        details: { reason: "rustup-missing" },
      });
      expect(built).toBe(0);
      expect(events[0]).toBe("leave:yes");
      expect(events).not.toContain("cargo");
    } finally {
      resetWorkspaceControlRendererWarmup();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-219] binary-missing restores TTY before any renderer error write", async () => {
    const events: string[] = [];
    resetWorkspaceControlRendererWarmup();
    setWorkspaceTuiScrollbackWriter((text) => {
      events.push(`leave:${text.includes("\x1b[?1049l") ? "yes" : "no"}`);
    });
    try {
      await expect(
        warmupWorkspaceControlRenderer({
          APPALOFT_WORKSPACE_TUI_BINARY: "/workspace/.missing-appaloft-workspace-tui",
          PATH: "",
        }),
      ).rejects.toMatchObject({
        details: { reason: "binary-missing" },
      });
      expect(events[0]).toBe("leave:yes");
    } finally {
      resetWorkspaceControlRendererWarmup();
    }
  });

  test("[WS-REMOTE-PROGRESS-219] rustup-missing restores TTY and does not glue or dump cargo-chooser", async () => {
    const { formatHumanCliError } = await import("../src/runtime.js");
    const rustupDump =
      "error: rustup could not choose a version of cargo to run, because one wasn't specified explicitly, and no default is configured.";
    const human = workspaceControlRendererUnavailableMessage({ rustupMissing: true });
    expect(human).toContain("TTY attach");
    expect(human).toContain(WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND);
    expect(human).toContain(WORKSPACE_CONTROL_TUI_BUILD_COMMAND);
    expect(human).toContain("--no-attach");
    expect(human).not.toMatch(/occupancy/iu);
    expect(human).not.toContain("could not choose a version of cargo");
    expect(
      sanitizeWorkspaceRendererFailureText(
        `${human}\n${rustupDump}\nerror: Workspace renderer appaloft-workspace-tui is unavailable.\nhelp: run 'rustup default stable' to download the latest stable release of Rust and set it as your default toolchain.`,
      ),
    ).not.toContain("could not choose a version of cargo");
    expect(
      sanitizeWorkspaceRendererFailureText(
        `${rustupDump}\nerror: Workspace renderer appaloft-workspace-tui is unavailable.`,
      ),
    ).not.toContain("Workspace renderer appaloft-workspace-tui is unavailable");
    const printed = formatHumanCliError({
      code: "infra_error",
      category: "infra",
      message: rustupDump,
      retryable: false,
      details: { phase: "workspace-control-renderer", reason: "rustup-missing" },
    });
    expect(printed).not.toContain("could not choose a version of cargo");
    expect(printed).toContain("appaloft-workspace-tui");
    expect(printed).not.toMatch(/occupancy/iu);

    let scrollback = "preparing the agent";
    restoreWorkspaceTuiScrollback((text) => {
      scrollback += text;
    });
    expect(scrollback).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
    expect(scrollback).toContain("\x1b[?25h");
    expect(scrollback).toContain("\x1b[?1049l");
    expect(scrollback).toContain(WORKSPACE_TUI_DISABLE_MOUSE);
    expect(scrollback).toContain("\n");
    expect(scrollback).not.toContain("preparing the agenterror:");
  });

  test("[WS-REMOTE-PROGRESS-219] printCliError leaves alt-screen before a single human line", async () => {
    const { Effect } = await import("effect");
    const { printCliError } = await import("../src/runtime.js");
    resetWorkspaceControlRendererWarmup();
    let stdout = "preparing the agent";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const originalExitCode = process.exitCode;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    const rustupMissing = {
      code: "infra_error",
      category: "infra",
      message:
        "error: rustup could not choose a version of cargo to run, because one wasn't specified explicitly, and no default is configured.\nerror: Workspace renderer appaloft-workspace-tui is unavailable.",
      retryable: false,
      details: { phase: "workspace-control-renderer", reason: "rustup-missing" },
    };
    const binaryMissing = {
      ...rustupMissing,
      message: workspaceControlRendererUnavailableMessage({ codeChrome: true }),
      details: { phase: "workspace-control-renderer", reason: "binary-missing" },
    };
    try {
      await Effect.runPromise(printCliError(rustupMissing));
      await Effect.runPromise(printCliError(rustupMissing));
      await Effect.runPromise(printCliError(binaryMissing));
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      process.exitCode = originalExitCode ?? 0;
      resetWorkspaceControlRendererWarmup();
    }
    expect(stdout).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
    expect(stdout).toContain(WORKSPACE_TUI_DISABLE_MOUSE);
    expect(stdout).toContain("\n");
    expect(`${stdout}error:`).not.toContain("preparing the agenterror:");
    expect(stderr).toContain("appaloft-workspace-tui");
    expect(stderr).toContain(WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND);
    expect(stderr).toContain(WORKSPACE_CONTROL_TUI_BUILD_COMMAND);
    expect(stderr).toContain("--no-attach");
    expect(stderr).not.toMatch(/occupancy/iu);
    expect(stderr).not.toContain("could not choose a version of cargo");
    expect(stderr).not.toContain("Workspace renderer appaloft-workspace-tui is unavailable");
    expect(stderr.split("TTY attach needs").length - 1).toBe(1);
  });
});
