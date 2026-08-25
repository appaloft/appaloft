import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { resolve } from "node:path";
import { writeWorkspaceControlRendererLine } from "../src/workspace-tui-launch";

const root = resolve(import.meta.dir, "../../../..");
const debugBinary = resolve(root, "apps/workspace-control-tui/target/debug/appaloft-workspace-tui");
const releaseBinary = resolve(
  root,
  "apps/workspace-control-tui/target/release/appaloft-workspace-tui",
);
const binaryPath =
  process.env.APPALOFT_WORKSPACE_TUI_BINARY ??
  (existsSync(debugBinary) ? debugBinary : releaseBinary);
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
  "[WS-TUI-ENTRY-001][WS-TUI-ERROR-008][WS-TUI-TERMINAL-012] real Ratatui sidecar renders and restores a Bun host terminal",
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
    const fixture = resolve(import.meta.dir, "fixtures/workspace-control-real-renderer.ts");
    const child = Bun.spawn([process.execPath, fixture], {
      terminal,
      env: {
        ...process.env,
        APPALOFT_WORKSPACE_TUI_BINARY: binaryPath,
      },
    });
    try {
      await waitForOutput(() => output, "Appaloft Cloud Agents");
      await waitForOutput(() => output, "preparing the agent");
      expect(output.toLowerCase()).not.toContain("occupancy");
      expect(output).not.toContain("sbx_real_renderer");
      expect(output).toContain("\x1b[?1049h");
      // List/menu quit is ^c before harness focus. q is unbound; ^] is stop-typing.
      // darwin host PTYs often deliver ^c as SIGINT to the parent, not a TUI key.
      // Stop signalling once the child starts exiting so a second SIGINT during
      // restore cannot turn a mapped wait-screen quit into 130.
      terminal.write("\x03");
      child.kill("SIGINT");
      let exitCode: number | undefined = await Promise.race([
        child.exited,
        Bun.sleep(400).then(() => undefined),
      ]);
      for (let attempt = 0; attempt < 8 && exitCode === undefined; attempt += 1) {
        terminal.write("\x03");
        child.kill("SIGINT");
        exitCode = await Promise.race([child.exited, Bun.sleep(200).then(() => undefined)]);
      }
      await waitForOutput(() => output, "\x1b[?1049l");
      expect(output).toContain("\x1b[?1049h");
      expect(output).toContain("\x1b[?1049l");
      if (exitCode !== 0) {
        expect(exitCode).toBe(130);
      }
    } finally {
      child.kill("SIGTERM");
      terminal.close();
    }
  },
  15_000,
);

realRendererTest(
  "[WS-TUI-ERROR-008][WS-TUI-TERMINAL-012] renderer signal cleanup restores the host terminal",
  async () => {
    expect(existsSync(binaryPath)).toBe(true);
    const token = "signal-cleanup-test-token";
    let rendererSocket: Socket | undefined;
    const server = createServer((socket) => {
      rendererSocket = socket;
      socket.setEncoding("utf8");
      socket.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "EPIPE") return;
      });
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        if (!buffer.includes("\n")) return;
        const line = buffer.slice(0, buffer.indexOf("\n"));
        const message = JSON.parse(line) as Record<string, unknown>;
        if (message.type === "hello" && message.token === token) {
          void writeWorkspaceControlRendererLine(socket, { type: "hello-ok" });
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
  },
  15_000,
);

async function waitForExit(child: { exited: Promise<number> }, ms: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<number>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`renderer still running after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function spawnHandshakenRenderer(input: {
  readonly mode?: "operate" | "development";
}): Promise<{
  child: ReturnType<typeof Bun.spawn>;
  terminal: Bun.Terminal;
  destroyParent: () => void;
  close: () => void;
}> {
  const token = `orphan-exit-${input.mode ?? "occupancy"}`;
  let rendererSocket: Socket | undefined;
  const handshake = Promise.withResolvers<void>();
  const server = createServer((socket) => {
    rendererSocket = socket;
    socket.setEncoding("utf8");
    socket.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "EPIPE") return;
    });
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      if (!buffer.includes("\n")) return;
      const line = buffer.slice(0, buffer.indexOf("\n"));
      const message = JSON.parse(line) as Record<string, unknown>;
      if (message.type === "hello" && message.token === token) {
        void writeWorkspaceControlRendererLine(socket, { type: "hello-ok" }).then(() => {
          handshake.resolve();
        });
      }
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test listener address");
  const terminal = new Bun.Terminal({ cols: 100, rows: 30 });
  const child = Bun.spawn([binaryPath], {
    terminal,
    env: {
      ...process.env,
      APPALOFT_WORKSPACE_TUI_PORT: String(address.port),
      APPALOFT_WORKSPACE_TUI_TOKEN: token,
      ...(input.mode ? { APPALOFT_TUI_MODE: input.mode } : {}),
    },
  });
  await handshake.promise;
  return {
    child,
    terminal,
    destroyParent: () => {
      rendererSocket?.destroy();
    },
    close: () => {
      child.kill("SIGKILL");
      rendererSocket?.destroy();
      server.close();
      terminal.close();
    },
  };
}

realRendererTest(
  "[WS-TUI-ORPHAN-014] occupancy exits after parent TCP drop without Shutdown",
  async () => {
    expect(existsSync(binaryPath)).toBe(true);
    const session = await spawnHandshakenRenderer({});
    try {
      session.destroyParent();
      await waitForExit(session.child, 500);
    } finally {
      session.close();
    }
  },
  8_000,
);

realRendererTest(
  "[WS-TUI-ORPHAN-014] occupancy SIGTERM exits within 200ms",
  async () => {
    expect(existsSync(binaryPath)).toBe(true);
    const session = await spawnHandshakenRenderer({});
    try {
      session.child.kill("SIGTERM");
      await waitForExit(session.child, 200);
    } finally {
      session.close();
    }
  },
  8_000,
);

realRendererTest(
  "[WS-TUI-ORPHAN-014] operate exits after parent TCP drop without Shutdown",
  async () => {
    expect(existsSync(binaryPath)).toBe(true);
    const session = await spawnHandshakenRenderer({ mode: "operate" });
    try {
      session.destroyParent();
      await waitForExit(session.child, 500);
    } finally {
      session.close();
    }
  },
  8_000,
);

realRendererTest(
  "[WS-TUI-ORPHAN-014] development exits after parent TCP drop without Shutdown",
  async () => {
    expect(existsSync(binaryPath)).toBe(true);
    const session = await spawnHandshakenRenderer({ mode: "development" });
    try {
      session.destroyParent();
      await waitForExit(session.child, 500);
    } finally {
      session.close();
    }
  },
  8_000,
);
