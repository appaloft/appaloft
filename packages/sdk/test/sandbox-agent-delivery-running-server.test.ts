import "../../application/node_modules/reflect-metadata/Reflect.js";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { mountAppaloftOrpcRoutes } from "@appaloft/orpc";
import { Elysia } from "elysia";

import { createAppaloftClient } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_agent_delivery_sdk",
      entrypoint: input.entrypoint,
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.principal ? { principal: input.principal } : {}),
      ...(input.tenant ? { tenant: input.tenant } : {}),
    });
  }
}

class RecordingBus {
  readonly messages: Array<{ name: string; input: Record<string, unknown> }> = [];

  execute<T>(_context: ExecutionContext, message: Command<T> | Query<T>): Promise<Result<T>> {
    const input = (message as unknown as { input?: Record<string, unknown> }).input ?? {};
    const name = message.constructor.name;
    this.messages.push({ name, input });
    if (name === "StreamSandboxAgentRunEventsQuery") {
      const stream = {
        async *[Symbol.asyncIterator]() {
          yield {
            kind: "event",
            schemaVersion: "sandbox-agent.run-events/v1",
            cursor: "1",
            runId: "srun_sdk",
            sequence: 1,
            occurredAt: "2026-07-20T00:00:00.000Z",
            eventType: "message",
            data: { text: "working" },
          };
          yield {
            kind: "closed",
            schemaVersion: "sandbox-agent.run-events/v1",
            runId: "srun_sdk",
            reason: "terminal",
          };
        },
        async close() {},
      };
      return Promise.resolve(ok({ mode: "stream", runId: "srun_sdk", stream } as T));
    }
    const values: Record<string, unknown> = {
      CreateSandboxCommand: { sandboxId: "sbx_sdk", status: "ready" },
      CreateSandboxAgentRuntimeCommand: { runtimeId: "srt_sdk", status: "ready" },
      CreateSandboxAgentRunCommand: { runId: "srun_sdk", status: "queued" },
      ListSandboxAgentApprovalsQuery: { items: [], total: 0 },
      CreateSandboxSourceArtifactCommand: {
        artifactId: "sart_sdk",
        digest: `sha256:${"a".repeat(64)}`,
        status: "available",
      },
      CreateSandboxCandidatePreviewCommand: {
        previewId: "sprev_sdk",
        artifactId: "sart_sdk",
        artifactDigest: `sha256:${"a".repeat(64)}`,
        status: "ready",
        url: "https://preview.example.test/p/sprev_sdk/token/",
      },
      PlanSandboxPromotionCommand: {
        promotionId: "sprom_sdk",
        artifactDigest: `sha256:${"a".repeat(64)}`,
        status: "planned",
      },
      AcceptSandboxPromotionCommand: {
        promotionId: "sprom_sdk",
        status: "accepted",
      },
    };
    return Promise.resolve(ok((values[name] ?? {}) as T));
  }
}

describe("sandbox agent delivery SDK running server", () => {
  const bus = new RecordingBus();
  let server: ReturnType<typeof Bun.serve> | undefined;

  beforeAll(() => {
    const authorization: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: { kind: "user", id: "usr_sdk_agent", label: "agent@example.test" },
          email: "agent@example.test",
          organizationId: "org_sdk_agent",
          role: input.requiredRole,
          userId: "usr_sdk_agent",
        }),
    };
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: bus as unknown as CommandBus,
      queryBus: bus as unknown as QueryBus,
      executionContextFactory: new TestContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: authorization,
    });
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => app.handle(request) });
  });

  afterAll(() => server?.stop(true));

  test("[AGENT-WS-HTTP-020] mounts harness, attach and Agent Task operations on the running HTTP server", async () => {
    if (!server) throw new Error("SDK test server was not started");
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const requests = [
      new Request(`${baseUrl}/api/sandbox-agent-harnesses`),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-runtimes/srt_sdk/attach`, {
        method: "POST",
      }),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs`),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs`, {
        method: "POST",
      }),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs/srun_sdk`),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs/srun_sdk/resume`, {
        method: "POST",
      }),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs/srun_sdk/cancel`, {
        method: "POST",
      }),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs/srun_sdk/approve`, {
        method: "POST",
      }),
      new Request(`${baseUrl}/api/sandboxes/sbx_sdk/agent-task-runs/srun_sdk/deliver`, {
        method: "POST",
      }),
    ];

    for (const request of requests) {
      const response = await fetch(request);
      expect(response.status, `${request.method} ${request.url}`).toBe(401);
      expect(response.headers.get("content-type"), `${request.method} ${request.url}`).toContain(
        "application/json",
      );
      expect(await response.json(), `${request.method} ${request.url}`).toMatchObject({
        error: {
          code: "product_auth_missing",
          details: {
            endpoint: new URL(request.url).pathname,
            method: request.method,
          },
        },
      });
    }
  });

  test("[TS-SDK-AGENT-001][TS-SDK-RESOURCE-001] executes the Sandbox handle to promotion contract over HTTP", async () => {
    if (!server) throw new Error("SDK test server was not started");
    const client = createAppaloftClient({
      baseUrl: `http://127.0.0.1:${server.port}/api`,
      auth: { kind: "product-session", cookie: "better-auth.session_token=agent-sdk" },
    });
    const digest = `sha256:${"a".repeat(64)}`;

    const sandbox = await client.sandboxes.create({
      source: { kind: "template", templateId: "sbt_pi" },
      requestedIsolation: "gvisor",
      limits: {
        cpuMillis: 1_000,
        memoryBytes: 256 * 1024 * 1024,
        diskBytes: 512 * 1024 * 1024,
        maxProcesses: 32,
      },
      networkPolicy: { mode: "deny", rules: [] },
    });
    const agent = await sandbox.agents.create({ harness: "pi", idempotencyKey: "runtime-sdk" });
    const run = await agent.runs.create({
      task: "Build the application",
      idempotencyKey: "run-sdk",
    });

    expect(agent).toMatchObject({ runtimeId: "srt_sdk", sandboxId: "sbx_sdk" });
    expect(run).toMatchObject({ runId: "srun_sdk", runtimeId: "srt_sdk" });
    const runEvents = [];
    for await (const envelope of run.events.stream()) runEvents.push(envelope);
    expect(runEvents).toEqual([
      expect.objectContaining({ kind: "event", eventType: "message", sequence: 1 }),
      expect.objectContaining({ kind: "closed", reason: "terminal" }),
    ]);
    const streamedRun = await agent.stream({
      prompt: "Check the test failures and fix the production code.",
      idempotencyKey: "run-sdk-stream",
    });
    const fullStream = [];
    for await (const envelope of streamedRun.fullStream) fullStream.push(envelope);
    expect(streamedRun).toMatchObject({ runId: "srun_sdk", runtimeId: "srt_sdk" });
    expect(fullStream).toEqual(runEvents);
    expect(await client.sandboxes.agents.approvals.list({ runId: "srun_sdk" })).toMatchObject({
      ok: true,
      data: { items: [] },
    });
    expect(
      await client.sandboxes.sourceArtifacts.create({
        sandboxId: "sbx_sdk",
        sourceRoot: "/workspace",
      }),
    ).toMatchObject({ ok: true, data: { artifactId: "sart_sdk", digest } });
    expect(
      await client.sandboxes.candidatePreviews.create({ artifactId: "sart_sdk" }),
    ).toMatchObject({ ok: true, data: { previewId: "sprev_sdk", artifactDigest: digest } });
    expect(
      await client.sandboxes.promotions.plan({
        sandboxId: "sbx_sdk",
        artifactId: "sart_sdk",
        expectedArtifactDigest: digest,
        candidatePreviewId: "sprev_sdk",
        target: {
          projectId: "prj_sdk",
          environmentId: "env_sdk",
          resourceName: "agent-app",
        },
      }),
    ).toMatchObject({ ok: true, data: { promotionId: "sprom_sdk", artifactDigest: digest } });
    expect(
      await client.sandboxes.promotions.accept({
        promotionId: "sprom_sdk",
        expectedArtifactDigest: digest,
        idempotencyKey: "accept-sdk",
      }),
    ).toMatchObject({ ok: true, data: { status: "accepted" } });

    expect(bus.messages.map(({ name }) => name)).toEqual([
      "CreateSandboxCommand",
      "CreateSandboxAgentRuntimeCommand",
      "CreateSandboxAgentRunCommand",
      "StreamSandboxAgentRunEventsQuery",
      "CreateSandboxAgentRunCommand",
      "StreamSandboxAgentRunEventsQuery",
      "ListSandboxAgentApprovalsQuery",
      "CreateSandboxSourceArtifactCommand",
      "CreateSandboxCandidatePreviewCommand",
      "PlanSandboxPromotionCommand",
      "AcceptSandboxPromotionCommand",
    ]);
    expect(bus.messages.at(-1)?.input).toMatchObject({
      promotionId: "sprom_sdk",
      expectedArtifactDigest: digest,
    });
  });
});
