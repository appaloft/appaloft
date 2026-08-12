import { describe, expect, test } from "bun:test";
import { createConnection, type Socket } from "node:net";
import {
  openLoopbackWorkspaceControlRenderer,
  type WorkspaceControlRendererProcess,
} from "../src/workspace-control-renderer";

describe("Operate renderer channel", () => {
  test("[OPR-TUI-004][OPR-CONFIRM-008][OPR-ERROR-016] accepts only bounded operate/v1 events", async () => {
    let client: Socket | undefined;
    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });
    const renderer = await openLoopbackWorkspaceControlRenderer({
      launch: async ({ host, port, token }): Promise<WorkspaceControlRendererProcess> => {
        client = createConnection({ host, port });
        let buffer = "";
        client.setEncoding("utf8");
        client.on("connect", () => client?.write(`${JSON.stringify({ type: "hello", token })}\n`));
        client.on("data", (chunk) => {
          buffer += String(chunk);
          while (buffer.includes("\n")) {
            const newline = buffer.indexOf("\n");
            const message = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
            buffer = buffer.slice(newline + 1);
            if (message.type === "hello-ok") {
              client?.write(
                `${JSON.stringify({ type: "operate-select", resourceId: "res_api" })}\n`,
              );
              client?.write(
                `${JSON.stringify({ type: "operate-preview-action", action: { kind: "rollback", resourceId: "res_api", deploymentId: "dep_bad" } })}\n`,
              );
              client?.write(
                `${JSON.stringify({ type: "operate-preview-action", action: { kind: "rollback", resourceId: "res_api", deploymentId: "dep_bad", candidateDeploymentId: "dep_good" } })}\n`,
              );
              client?.write(
                `${JSON.stringify({ type: "operate-confirm-action", token: "confirm_1", action: { kind: "rollback", resourceId: "res_api", deploymentId: "dep_bad", candidateDeploymentId: "dep_good" } })}\n`,
              );
              client?.write(`${JSON.stringify({ type: "operate-quit" })}\n`);
            }
            if (message.type === "shutdown") client?.end();
          }
        });
        client.on("close", resolveExited);
        return { exited, terminate: () => client?.destroy() };
      },
    });
    const events = renderer.events()[Symbol.asyncIterator]();
    expect(await events.next()).toEqual({
      done: false,
      value: { type: "operate-select", resourceId: "res_api" },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: {
        type: "operate-preview-action",
        action: {
          kind: "rollback",
          resourceId: "res_api",
          deploymentId: "dep_bad",
          candidateDeploymentId: "dep_good",
        },
      },
    });
    expect(await events.next()).toEqual({
      done: false,
      value: {
        type: "operate-confirm-action",
        token: "confirm_1",
        action: {
          kind: "rollback",
          resourceId: "res_api",
          deploymentId: "dep_bad",
          candidateDeploymentId: "dep_good",
        },
      },
    });
    expect(await events.next()).toEqual({ done: false, value: { type: "operate-quit" } });
    await renderer.close();
    expect(client?.destroyed).toBe(true);
  });
});
