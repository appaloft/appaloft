import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { createConnection, createServer, type Socket } from "node:net";
import {
  openLoopbackWorkspaceControlRenderer,
  type WorkspaceControlRendererProcess,
  writeWorkspaceControlRendererLine,
} from "../src/workspace-control-renderer";

describe("Workspace control renderer channel", () => {
  test("[WS-TUI-ERROR-008][WS-TUI-PACKAGE-011][WS-TUI-RECOVERY-004][WS-TUI-RECOVERY-005] authenticates one loopback client and validates bounded recovery events", async () => {
    let client: Socket | undefined;
    let launchHost = "";
    let launchToken = "";
    const parentMessages: Array<Record<string, unknown>> = [];
    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });

    const renderer = await openLoopbackWorkspaceControlRenderer({
      launch: async ({ host, port, token }): Promise<WorkspaceControlRendererProcess> => {
        launchHost = host;
        launchToken = token;
        client = createConnection({ host, port });
        let buffer = "";
        client.setEncoding("utf8");
        client.on("connect", () => {
          client?.write(`${JSON.stringify({ type: "hello", token })}\n`);
        });
        client.on("data", (chunk) => {
          buffer += String(chunk);
          while (buffer.includes("\n")) {
            const newline = buffer.indexOf("\n");
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const message = JSON.parse(line) as Record<string, unknown>;
            parentMessages.push(message);
            if (message.type === "hello-ok") {
              client?.write(`${JSON.stringify({ type: "select", workspaceId: "sbx_1" })}\n`);
              client?.write(
                `${JSON.stringify({
                  type: "lifecycle-action",
                  workspaceId: "sbx_1",
                  action: "resume",
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "preview-expose",
                  workspaceId: "sbx_1",
                  port: 3000,
                  visibility: "private",
                  ttlMinutes: 999,
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "preview-expose",
                  workspaceId: "sbx_1",
                  port: 3000,
                  visibility: "private",
                  ttlMinutes: 60,
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "task-deliver",
                  workspaceId: "sbx_1",
                  taskRunId: "task_1",
                  branch: "feat/tui",
                  commitMessage: "feat: tui",
                  remote: "origin",
                  pullRequest: { title: "TUI delivery", base: "main" },
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "promotion-accept",
                  workspaceId: "sbx_1",
                  promotionId: "prm_1",
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "snapshot-create",
                  workspaceId: "sbx_1",
                  capability: "filesystem",
                  ttlDays: 2,
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "snapshot-create",
                  workspaceId: "sbx_1",
                  capability: "filesystem-memory",
                  ttlDays: 7,
                })}\n`,
              );
              client?.write(
                `${JSON.stringify({
                  type: "snapshot-delete",
                  workspaceId: "sbx_1",
                  snapshotId: "ssn_1",
                })}\n`,
              );
              client?.write(`${JSON.stringify({ type: "quit" })}\n`);
            }
            if (message.type === "shutdown") client?.end();
          }
        });
        client.on("close", resolveExited);
        return {
          exited,
          terminate: () => client?.destroy(),
        };
      },
    });

    await renderer.send({
      type: "workspaces",
      workspaces: [{ workspaceId: "sbx_1", status: "running" }],
    });
    const events = renderer.events()[Symbol.asyncIterator]();
    expect(await events.next()).toEqual({
      done: false,
      value: { type: "select", workspaceId: "sbx_1" },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: { type: "lifecycle-action", workspaceId: "sbx_1", action: "resume" },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: {
        type: "preview-expose",
        workspaceId: "sbx_1",
        port: 3000,
        visibility: "private",
        ttlMinutes: 60,
      },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: {
        type: "task-deliver",
        workspaceId: "sbx_1",
        taskRunId: "task_1",
        branch: "feat/tui",
        commitMessage: "feat: tui",
        remote: "origin",
        pullRequest: { title: "TUI delivery", base: "main" },
      },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: { type: "promotion-accept", workspaceId: "sbx_1", promotionId: "prm_1" },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: {
        type: "snapshot-create",
        workspaceId: "sbx_1",
        capability: "filesystem-memory",
        ttlDays: 7,
      },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: { type: "snapshot-delete", workspaceId: "sbx_1", snapshotId: "ssn_1" },
    });
    expect(await events.next()).toEqual({ done: false, value: { type: "quit" } });
    await renderer.close();

    expect(launchHost).toBe("127.0.0.1");
    expect(launchToken).toMatch(/^[a-f0-9]{64}$/);
    expect(parentMessages).toContainEqual({ type: "hello-ok" });
    expect(parentMessages).toContainEqual({
      type: "workspaces",
      workspaces: [{ workspaceId: "sbx_1", status: "running" }],
    });
    expect(parentMessages).toContainEqual({ type: "shutdown" });
    expect(client?.destroyed).toBe(true);
  });

  test("[WS-TUI-ERROR-008] rejects an invalid renderer token and terminates the renderer process", async () => {
    let client: Socket | undefined;
    let terminated = 0;
    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });

    await expect(
      openLoopbackWorkspaceControlRenderer({
        launch: async ({ host, port }): Promise<WorkspaceControlRendererProcess> => {
          client = createConnection({ host, port });
          client.on("connect", () => {
            client?.write(`${JSON.stringify({ type: "hello", token: "wrong-token" })}\n`);
          });
          client.on("close", resolveExited);
          return {
            exited,
            terminate: () => {
              terminated += 1;
              client?.destroy();
            },
          };
        },
      }),
    ).rejects.toMatchObject({
      category: "infra",
      details: { phase: "workspace-control-renderer", reason: "handshake-auth" },
    });

    expect(terminated).toBe(1);
    expect(client?.destroyed).toBe(true);
  });

  test("[WS-TUI-ERROR-008] fails promptly when the renderer exits before authentication", async () => {
    let terminated = 0;
    await expect(
      openLoopbackWorkspaceControlRenderer({
        launch: async (): Promise<WorkspaceControlRendererProcess> => ({
          exited: Promise.resolve(),
          terminate: () => {
            terminated += 1;
          },
        }),
      }),
    ).rejects.toMatchObject({
      category: "infra",
      details: { phase: "workspace-control-renderer", reason: "process-exited" },
    });
    expect(terminated).toBe(1);
  });

  test("[WS-TUI-ERROR-008][WS-TUI-TERMINAL-012][WS-REMOTE-PROGRESS-219] parent write after renderer close swallows EPIPE", async () => {
    let client: Socket | undefined;
    let resolveHelloOk!: () => void;
    const helloOk = new Promise<void>((resolve) => {
      resolveHelloOk = resolve;
    });
    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });

    const renderer = await openLoopbackWorkspaceControlRenderer({
      launch: async ({ host, port, token }): Promise<WorkspaceControlRendererProcess> => {
        client = createConnection({ host, port });
        client.setEncoding("utf8");
        client.on("connect", () => {
          client?.write(`${JSON.stringify({ type: "hello", token })}\n`);
        });
        client.on("data", (chunk) => {
          if (String(chunk).includes("hello-ok")) resolveHelloOk();
        });
        client.on("close", resolveExited);
        return {
          exited,
          terminate: () => client?.destroy(),
        };
      },
    });

    await helloOk;
    client?.destroy();
    await exited;
    await expect(
      renderer.send({ type: "loading", title: "Appaloft Cloud Agents" }),
    ).resolves.toBeUndefined();
    await expect(renderer.close()).resolves.toBeUndefined();
  });

  test("[WS-TUI-ERROR-008][WS-REMOTE-PROGRESS-219] renderer line write swallows EPIPE after the peer closes", async () => {
    let parent: Socket | undefined;
    const server = createServer((socket) => {
      parent = socket;
      socket.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "EPIPE") return;
      });
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test listener address");
    const client = createConnection({ host: "127.0.0.1", port: address.port });
    await new Promise<void>((resolveConnect, rejectConnect) => {
      client.once("connect", resolveConnect);
      client.once("error", rejectConnect);
    });
    await Bun.sleep(10);
    client.destroy();
    await Bun.sleep(10);
    if (!parent) throw new Error("missing parent socket");
    await expect(
      writeWorkspaceControlRendererLine(parent, { type: "hello-ok" }),
    ).resolves.toBeUndefined();
    await expect(
      writeWorkspaceControlRendererLine(parent, { type: "shutdown" }),
    ).resolves.toBeUndefined();
    await new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
    });
  });

  test("[WS-REMOTE-PROGRESS-195] source checkout cargo-builds a missing occupancy TUI sidecar", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { ensureWorkspaceControlRendererBinary, workspaceControlRendererCrateDir } = await import(
      "../src/workspace-control-renderer"
    );
    const root = await mkdtemp(join(tmpdir(), "appaloft-tui-crate-"));
    const crate = join(root, "apps", "workspace-control-tui");
    const debugBinary = join(crate, "target", "debug", "appaloft-workspace-tui");
    await mkdir(crate, { recursive: true });
    await writeFile(
      join(crate, "Cargo.toml"),
      '[package]\nname = "appaloft-workspace-control-tui"\n',
    );
    let built = 0;
    try {
      expect(workspaceControlRendererCrateDir({ APPALOFT_REPO_ROOT: root, PATH: "" })).toBe(crate);
      const resolved = await ensureWorkspaceControlRendererBinary(
        { APPALOFT_REPO_ROOT: root, PATH: "" },
        async (crateDir) => {
          built += 1;
          expect(crateDir).toBe(crate);
          await mkdir(join(crate, "target", "debug"), { recursive: true });
          await writeFile(debugBinary, "");
        },
        { rustcVersion: "rustc 1.97.0" },
      );
      expect(built).toBe(1);
      expect(resolved).toBe(debugBinary);
      const again = await ensureWorkspaceControlRendererBinary(
        { APPALOFT_REPO_ROOT: root, PATH: "" },
        async () => {
          built += 1;
        },
        { rustcVersion: "rustc 1.97.0" },
      );
      expect(built).toBe(1);
      expect(again).toBe(debugBinary);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-198] missing renderer names the binary and next command", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const {
      WORKSPACE_CONTROL_TUI_BINARY_NAME,
      WORKSPACE_CONTROL_TUI_BUILD_COMMAND,
      ensureWorkspaceControlRendererBinary,
      rustcTooOldForWorkspaceControlTui,
      workspaceControlRendererUnavailableMessage,
    } = await import("../src/workspace-control-renderer");
    const { formatHumanCliError } = await import("../src/runtime");
    const message = workspaceControlRendererUnavailableMessage({
      rustcVersion: "rustc 1.85.0 (4d91de4e9 2025-02-17)",
    });
    expect(rustcTooOldForWorkspaceControlTui("rustc 1.85.0")).toBeTrue();
    expect(message).toContain(WORKSPACE_CONTROL_TUI_BINARY_NAME);
    expect(message).toContain(WORKSPACE_CONTROL_TUI_BUILD_COMMAND);
    expect(message).toContain("Homebrew rustc");
    expect(message).not.toContain("rustup default");
    expect(message).toContain("rustc 1.85");
    expect(message).toContain("--no-attach");
    const printed = formatHumanCliError({
      code: "infra_error",
      category: "infra",
      message,
      retryable: false,
      details: { phase: "workspace-control-renderer", reason: "toolchain-old" },
    });
    expect(printed).toContain(WORKSPACE_CONTROL_TUI_BINARY_NAME);
    expect(printed).toContain(WORKSPACE_CONTROL_TUI_BUILD_COMMAND);
    const root = await mkdtemp(join(tmpdir(), "appaloft-tui-old-rustc-"));
    const crate = join(root, "apps", "workspace-control-tui");
    await mkdir(crate, { recursive: true });
    await writeFile(
      join(crate, "Cargo.toml"),
      '[package]\nname = "appaloft-workspace-control-tui"\n',
    );
    let built = 0;
    try {
      let caught: unknown;
      try {
        await ensureWorkspaceControlRendererBinary(
          { APPALOFT_REPO_ROOT: root, PATH: "" },
          async () => {
            built += 1;
          },
          { rustcVersion: "rustc 1.85.0 (4d91de4e9 2025-02-17)" },
        );
      } catch (error) {
        caught = error;
      }
      expect(built).toBe(0);
      expect(caught).toMatchObject({
        category: "infra",
        details: { reason: "toolchain-old" },
      });
      expect(String((caught as { message?: string }).message)).toContain(
        WORKSPACE_CONTROL_TUI_BINARY_NAME,
      );
      expect(String((caught as { message?: string }).message)).toContain(
        WORKSPACE_CONTROL_TUI_BUILD_COMMAND,
      );
      expect(String((caught as { message?: string }).message)).toContain("rustc 1.85");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-200] community pin locates a sibling checkout TUI binary", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const {
      ensureWorkspaceControlRendererBinary,
      resolveWorkspaceControlRendererBinary,
      workspaceControlRendererSearchRoots,
    } = await import("../src/workspace-control-renderer");
    const workspace = await mkdtemp(join(tmpdir(), "appaloft-sibling-tui-"));
    const community = join(workspace, "appaloft-cloud", "community", "appaloft");
    const publicCheckout = join(workspace, "appaloft");
    const communityCrate = join(community, "apps", "workspace-control-tui");
    const publicCrate = join(publicCheckout, "apps", "workspace-control-tui");
    const publicBinary = join(publicCrate, "target", "debug", "appaloft-workspace-tui");
    await mkdir(communityCrate, { recursive: true });
    await mkdir(join(publicCrate, "target", "debug"), { recursive: true });
    await writeFile(join(communityCrate, "Cargo.toml"), '[package]\nname = "tui"\n');
    await writeFile(join(publicCrate, "Cargo.toml"), '[package]\nname = "tui"\n');
    await writeFile(publicBinary, "");
    let built = 0;
    try {
      const env = { APPALOFT_REPO_ROOT: community, PATH: "" };
      const roots = workspaceControlRendererSearchRoots(env);
      expect(roots).toContain(community);
      expect(roots).toContain(publicCheckout);
      expect(resolveWorkspaceControlRendererBinary(env)).toBe(publicBinary);
      const resolved = await ensureWorkspaceControlRendererBinary(
        env,
        async () => {
          built += 1;
        },
        { rustcVersion: "rustc 1.85.0" },
      );
      expect(built).toBe(0);
      expect(resolved).toBe(publicBinary);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
