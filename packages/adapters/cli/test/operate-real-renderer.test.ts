import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../..");
const binaryPath =
  process.env.APPALOFT_WORKSPACE_TUI_BINARY ??
  resolve(root, "apps/workspace-control-tui/target/release/appaloft-workspace-tui");
const realRendererTest =
  existsSync(binaryPath) || process.env.APPALOFT_WORKSPACE_TUI_REQUIRED === "true"
    ? test
    : test.skip;

async function waitForOutput(read: () => string, needle: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!read().includes(needle)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${needle}; output=${JSON.stringify(read())}`);
    }
    await Bun.sleep(20);
  }
}

realRendererTest(
  "[OPR-TUI-004][OPR-CLEANUP-017] real Operate Ratatui sidecar renders and restores a Bun host terminal",
  async () => {
    expect(existsSync(binaryPath)).toBe(true);
    let output = "";
    const terminal = new Bun.Terminal({
      cols: 120,
      rows: 36,
      data: (_terminal, data) => {
        output += new TextDecoder().decode(data);
      },
    });
    const fixture = resolve(import.meta.dir, "fixtures/operate-real-renderer.ts");
    const child = Bun.spawn([process.execPath, fixture], {
      terminal,
      env: {
        ...process.env,
        APPALOFT_WORKSPACE_TUI_BINARY: binaryPath,
      },
    });
    try {
      await waitForOutput(() => output, "res_real_operate");
      expect(output).toContain("Appaloft");
      expect(output).toContain("Operate");
      expect(output).toContain("resource_health_unavailable");
      expect(output).toContain("boot");
      expect(output).toContain("failed");
      terminal.write("q");
      expect(await child.exited).toBe(0);
      await waitForOutput(() => output, "\x1b[?1049l");
      expect(output).toContain("\x1b[?1049h");
      expect(output).toContain("\x1b[?1049l");
    } finally {
      child.kill("SIGTERM");
      terminal.close();
    }
  },
  15_000,
);
