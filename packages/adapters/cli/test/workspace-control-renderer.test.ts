import { describe, expect, test } from "bun:test";
import { createConnection, type Socket } from "node:net";
import {
  openLoopbackWorkspaceControlRenderer,
  type WorkspaceControlRendererProcess,
} from "../src/workspace-control-renderer";

describe("Workspace control renderer channel", () => {
  test("[WS-TUI-ERROR-008][WS-TUI-PACKAGE-011] authenticates one loopback client and removes the ephemeral channel", async () => {
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
});
