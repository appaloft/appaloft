import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  StreamSandboxAgentRunEventsQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class ContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_agent_run_stream",
      entrypoint: input.entrypoint,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("Sandbox Agent Run event stream HTTP route", () => {
  test("[AGENT-STREAM-009] exposes cursor-replayable Run event envelopes as SSE", async () => {
    let observed: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        observed = query as Query<unknown>;
        const stream = {
          async *[Symbol.asyncIterator]() {
            yield {
              kind: "event",
              schemaVersion: "sandbox-agent.run-events/v1",
              cursor: "1",
              runId: "srun_stream",
              sequence: 1,
              occurredAt: "2026-07-20T00:00:00.000Z",
              eventType: "message",
              data: { text: "working" },
            };
            yield {
              kind: "closed",
              schemaVersion: "sandbox-agent.run-events/v1",
              runId: "srun_stream",
              reason: "terminal",
            };
          },
          async close() {},
        };
        return ok({ mode: "stream", runId: "srun_stream", stream } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: { execute: async () => ok(undefined) } as CommandBus,
      queryBus,
      executionContextFactory: new ContextFactory(),
      logger: new NoopLogger(),
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/sandbox-agent-runs/srun_stream/events/stream?afterSequence=0&limit=10",
        { headers: { authorization: "Bearer test" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain('"eventType":"message"');
    expect(body).toContain('"reason":"terminal"');
    expect(observed).toBeInstanceOf(StreamSandboxAgentRunEventsQuery);
    expect((observed as StreamSandboxAgentRunEventsQuery).input).toMatchObject({
      runId: "srun_stream",
      afterSequence: 0,
      limit: 10,
    });
  });
});
