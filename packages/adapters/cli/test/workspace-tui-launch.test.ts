import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resetWorkspaceControlRendererWarmup,
  resolveCodeWorkspaceControlRendererBinary,
  resolveWorkspaceControlRendererBinary,
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
      expect(message).toContain("Appaloft Cloud Agents");
      expect(message).not.toMatch(/occupancy/iu);
      expect(message).not.toContain("rustup");
      expect(message).not.toContain("cargo build");
      expect(message).not.toContain("--no-attach");
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
});
