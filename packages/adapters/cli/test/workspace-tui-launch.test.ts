import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkspaceControlRendererBinary } from "../src/workspace-tui-launch";

describe("occupancy TUI slim launch", () => {
  test("[WS-REMOTE-PROGRESS-202] launch module does not import composition", () => {
    const source = readFileSync(join(import.meta.dir, "../src/workspace-tui-launch.ts"), "utf8");
    expect(source).not.toContain("@appaloft/application");
    expect(source).not.toContain("@appaloft/core");
    expect(source).not.toContain("workspace-control-presentation");
    expect(source).not.toContain("operate-presentation");
    expect(source).not.toContain("reflect-metadata");
    const warmupAt = source.indexOf("export async function warmupWorkspaceControlRenderer");
    const resolveAt = source.indexOf(
      "resolveWorkspaceControlRendererBinary(environment)",
      warmupAt,
    );
    const ensureAt = source.indexOf("ensureWorkspaceControlRendererBinary(environment)", warmupAt);
    expect(warmupAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(warmupAt);
    expect(ensureAt).toBeGreaterThan(resolveAt);
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
});
