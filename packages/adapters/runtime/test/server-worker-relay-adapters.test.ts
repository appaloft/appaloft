import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ok } from "@appaloft/core";
import type { ServerWorkerDispatchResult } from "@appaloft/server-worker-relay";

import {
  ControlPlaneDevelopmentSessionRuntime,
  RelayDevelopmentSessionRuntime,
  RelaySandboxDockerCommandRunner,
  createRelayDevelopmentHandler,
  createRelaySandboxDockerHandler,
} from "../src";

describe("Server Worker relay adapters", () => {
  test("[SWR-EXEC-006] runtime.docker rejects non-Docker argv before the local runner", async () => {
    let called = false;
    const handler = createRelaySandboxDockerHandler({
      run: async () => {
        called = true;
        return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
      },
    });

    const result = await handler({
      requestId: "docker-host-bypass",
      capability: "runtime.docker",
      payload: { argv: ["sh", "-c", "id"] },
    });

    expect(result.isErr()).toBe(true);
    expect(called).toBe(false);
  });

  test("[SWR-EXEC-006] rejects host Development commands without explicit owner opt-in", async () => {
    let started = false;
    const handler = createRelayDevelopmentHandler(
      {
        start: async () => {
          started = true;
          return ok({ state: "running" });
        },
        status: async () => ok({ state: "running" }),
        logs: async () => ok({ lines: [] }),
        stop: async () => ok({ state: "stopped" }),
        reset: async () => ok({ state: "reset" }),
      },
      { sourceRoot: "/tmp/worker-sources", allowHostShell: false } as never,
    );

    const result = await handler({
      requestId: "dev-host-shell-denied",
      capability: "runtime.dev",
      payload: {
        operation: "start",
        input: {
          plan: {
            sourceRoot: "/workspace",
            configFilePath: null,
            deploymentGraph: {},
            services: [
              {
                key: "app",
                commandIntent: "bun run dev",
                commandArgs: ["bun", "run", "dev"],
                watch: "none",
                workingDirectory: "/workspace",
              },
            ],
          },
          detach: true,
          envFiles: [],
          environmentOverlay: {},
        },
      },
    });

    expect(result.isErr()).toBe(true);
    expect(started).toBe(false);
  });

  test("[SWR-EXEC-006] keeps Docker Compose Development available without host-shell opt-in", async () => {
    let started = false;
    const handler = createRelayDevelopmentHandler(
      {
        start: async () => {
          started = true;
          return ok({ state: "running" });
        },
        status: async () => ok({ state: "running" }),
        logs: async () => ok({ lines: [] }),
        stop: async () => ok({ state: "stopped" }),
        reset: async () => ok({ state: "reset" }),
      },
      { sourceRoot: "/tmp/worker-sources", allowHostShell: false },
    );
    const result = await handler({
      requestId: "dev-compose-allowed",
      capability: "runtime.dev",
      payload: {
        operation: "start",
        input: {
          plan: {
            sourceRoot: "/workspace",
            configFilePath: null,
            deploymentGraph: {},
            services: [
              {
                key: "app",
                commandIntent: "docker compose up",
                commandArgs: ["docker", "compose", "up"],
                cleanupArgs: ["docker", "compose", "down"],
                watch: "none",
                workingDirectory: "/workspace",
              },
            ],
          },
          detach: true,
          envFiles: [],
          environmentOverlay: {},
        },
      },
    });

    expect(result.isOk()).toBe(true);
    expect(started).toBe(true);
  });

  test("[SWR-DEV-008] sends the bounded source and shared Development Plan through the control plane", async () => {
    const source = mkdtempSync(join(tmpdir(), "appaloft-control-plane-dev-source-"));
    writeFileSync(join(source, "index.ts"), "console.log('remote')");
    const requests: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = [];
    const runtime = new ControlPlaneDevelopmentSessionRuntime({
      baseUrl: "https://cloud.example",
      serverId: "server/remote",
      headers: { authorization: "Bearer secret-token" },
      planResolver: async (input) => ok({
        sourceRoot: input.sourceRoot,
        configFilePath: null,
        deploymentGraph: {},
        services: [{ key: "app", commandIntent: "bun index.ts", watch: "none", workingDirectory: input.sourceRoot }],
      }),
      fetch: (async (request, init) => {
        requests.push({
          url: String(request),
          authorization: new Headers(init?.headers).get("authorization"),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return Response.json({ state: "running", sourceRoot: source });
      }) as typeof fetch,
    });
    const plan = await runtime.plan({ sourceRoot: source });
    if (plan.isErr()) throw plan.error;
    expect((await runtime.start({ plan: plan.value, detach: true, envFiles: [], environmentOverlay: {} })).isOk()).toBe(true);
    expect(requests[0]?.url).toBe("https://cloud.example/cloud/server-workers/by-server/server%2Fremote/development/start");
    expect(requests[0]?.authorization).toBe("Bearer secret-token");
    expect(JSON.stringify(requests[0]?.body)).toContain("server-worker-source/v1");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("secret-token");
  });

  test("[SWR-SNAPSHOT-009][SWR-EXEC-006] reuses the Sandbox Docker runner contract", async () => {
    const calls: unknown[] = [];
    const runner = new RelaySandboxDockerCommandRunner({
      workerId: "worker-1",
      generation: 2,
      relay: {
        request: async (input) => {
          calls.push(input);
          return ok({ requestId: input.requestId, exitCode: 0, stdout: "snapshot", stderr: "" });
        },
        openStream: async () => {
          throw new Error("not used");
        },
      },
    });
    const result = await runner.run(["docker", "commit", "container", "image"], { timeoutMs: 10_000 });
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe("snapshot");
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).toContain("runtime.docker");
  });

  test("[SWR-DEV-008] transports the public Development Session contract without another model", async () => {
    const operations: string[] = [];
    const runtime = new RelayDevelopmentSessionRuntime({
      workerId: "worker-1",
      generation: 1,
      request: async (input) => {
        const payload = input.payload as { operation: string };
        operations.push(payload.operation);
        const response: ServerWorkerDispatchResult = {
          requestId: input.requestId,
          data: Buffer.from(JSON.stringify({ state: payload.operation === "start" ? "running" : "stopped" })).toString("base64"),
        };
        return ok(response);
      },
    });
    const plan = {
      sourceRoot: "/workspace",
      configFilePath: null,
      deploymentGraph: {},
      services: [],
    };
    expect((await runtime.start({ plan, detach: true, envFiles: [], environmentOverlay: {} })).isOk()).toBe(true);
    await runtime.status({ sourceRoot: "/workspace" });
    await runtime.logs({ sourceRoot: "/workspace", follow: false, tail: 100 });
    await runtime.stop({ sourceRoot: "/workspace" });
    await runtime.reset({ sourceRoot: "/workspace" });
    expect(operations).toEqual(["start", "status", "logs", "stop", "reset"]);
  });

  test("[SWR-DEV-008] materializes bounded source and remaps the same Development Plan", async () => {
    const source = mkdtempSync(join(tmpdir(), "appaloft-relay-dev-source-"));
    const workerSources = mkdtempSync(join(tmpdir(), "appaloft-relay-dev-worker-"));
    writeFileSync(join(source, "index.ts"), "remote-source");
    let startedRoot = "";
    const handler = createRelayDevelopmentHandler(
      {
        start: async (input) => {
          startedRoot = input.plan.sourceRoot;
          return ok({ state: "running", sourceRoot: input.plan.sourceRoot });
        },
        status: async (input) => ok({ state: "running", sourceRoot: input.sourceRoot }),
        logs: async () => ok({ lines: [] }),
        stop: async () => ok({ state: "stopped" }),
        reset: async () => ok({ state: "reset" }),
      },
      { sourceRoot: workerSources, allowHostShell: true },
    );
    const runtime = new RelayDevelopmentSessionRuntime({
      workerId: "worker-1",
      generation: 1,
      sourceTransfer: true,
      request: (input) => handler({ requestId: input.requestId, capability: input.capability, payload: input.payload }),
    });
    const started = await runtime.start({
      plan: {
        sourceRoot: source,
        configFilePath: null,
        deploymentGraph: {},
        services: [{ key: "app", commandIntent: "bun index.ts", watch: "none", workingDirectory: source }],
      },
      detach: true,
      envFiles: [],
      environmentOverlay: {},
    });
    expect(started.isOk()).toBe(true);
    expect(startedRoot.startsWith(workerSources)).toBe(true);
    expect(readFileSync(join(startedRoot, "index.ts"), "utf8")).toBe("remote-source");
    expect(readdirSync(workerSources)).toHaveLength(1);
    const status = await runtime.status({ sourceRoot: source });
    expect(status.isOk()).toBe(true);
    expect(JSON.stringify(status)).toContain(startedRoot);
  });
});
