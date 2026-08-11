import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { resolve } from "node:path";

async function waitForOutput(read: () => string, needle: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!read().includes(needle)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${needle}; output=${JSON.stringify(read())}`);
    }
    await Bun.sleep(20);
  }
}

test("[WS-TUI-ENTRY-001][WS-TUI-ERROR-008][WS-TUI-TERMINAL-012] real Ratatui sidecar renders and restores a Bun host terminal", async () => {
  const root = resolve(import.meta.dir, "../../../..");
  const binaryPath = resolve(
    root,
    "apps/workspace-control-tui/target/release/appaloft-workspace-tui",
  );
  expect(existsSync(binaryPath)).toBe(true);
  let output = "";
  const terminal = new Bun.Terminal({
    cols: 120,
    rows: 36,
    data: (_terminal, data) => {
      output += new TextDecoder().decode(data);
    },
  });
  const fixture = resolve(import.meta.dir, "fixtures/workspace-control-real-renderer.ts");
  const child = Bun.spawn([process.execPath, fixture], {
    terminal,
    env: {
      ...process.env,
      APPALOFT_WORKSPACE_TUI_BINARY: binaryPath,
    },
  });
  try {
    await waitForOutput(() => output, "sbx_real_renderer");
    expect(output).toContain("Workspaces");
    expect(output).toContain("Ctrl+]");
    terminal.write("q");
    expect(await child.exited).toBe(0);
    await waitForOutput(() => output, "\x1b[?1049l");
    expect(output).toContain("\x1b[?1049h");
    expect(output).toContain("\x1b[?1049l");
  } finally {
    child.kill("SIGTERM");
    terminal.close();
  }
}, 15_000);

test("[WS-TUI-ERROR-008][WS-TUI-TERMINAL-012] renderer signal cleanup restores the host terminal", async () => {
  const root = resolve(import.meta.dir, "../../../..");
  const binaryPath = resolve(
    root,
    "apps/workspace-control-tui/target/release/appaloft-workspace-tui",
  );
  expect(existsSync(binaryPath)).toBe(true);
  const token = "signal-cleanup-test-token";
  let rendererSocket: Socket | undefined;
  const server = createServer((socket) => {
    rendererSocket = socket;
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      if (!buffer.includes("\n")) return;
      const line = buffer.slice(0, buffer.indexOf("\n"));
      const message = JSON.parse(line) as Record<string, unknown>;
      if (message.type === "hello" && message.token === token) {
        socket.write(`${JSON.stringify({ type: "hello-ok" })}\n`);
      }
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test listener address");
  let output = "";
  const terminal = new Bun.Terminal({
    cols: 100,
    rows: 30,
    data: (_terminal, data) => {
      output += new TextDecoder().decode(data);
    },
  });
  const child = Bun.spawn([binaryPath], {
    terminal,
    env: {
      ...process.env,
      APPALOFT_WORKSPACE_TUI_PORT: String(address.port),
      APPALOFT_WORKSPACE_TUI_TOKEN: token,
    },
  });
  try {
    await waitForOutput(() => output, "\x1b[?1049h");
    child.kill("SIGTERM");
    expect(await child.exited).toBe(0);
    await waitForOutput(() => output, "\x1b[?1049l");
  } finally {
    child.kill("SIGKILL");
    rendererSocket?.destroy();
    server.close();
    terminal.close();
  }
}, 15_000);
