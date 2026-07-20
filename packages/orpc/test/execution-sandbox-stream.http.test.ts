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
  StreamSandboxEventsQuery,
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
      requestId: input.requestId ?? "req_sandbox_stream",
      entrypoint: input.entrypoint,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("execution sandbox event stream HTTP route", () => {
  test("[SBX-STREAM-001] exposes cancellable event envelopes as SSE", async () => {
    let observed: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        observed = query as Query<unknown>;
        const stream = {
          async *[Symbol.asyncIterator]() {
            yield {
              kind: "event",
              schemaVersion: "sandbox.events/v1",
              cursor: "cursor_1",
              sandboxId: "sbx_stream",
              occurredAt: "2026-07-20T00:00:00.000Z",
              eventType: "sandbox-ready",
              source: "lifecycle",
              payload: {},
            };
            yield { kind: "closed", schemaVersion: "sandbox.events/v1", reason: "terminal" };
          },
          async close() {},
        };
        return ok({ mode: "stream", sandboxId: "sbx_stream", stream } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: { execute: async () => ok(undefined) } as CommandBus,
      queryBus,
      executionContextFactory: new ContextFactory(),
      logger: new NoopLogger(),
    });

    const response = await app.handle(
      new Request("http://localhost/api/sandboxes/sbx_stream/events/stream?limit=10", {
        headers: { authorization: "Bearer test" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain('"eventType":"sandbox-ready"');
    expect(observed).toBeInstanceOf(StreamSandboxEventsQuery);
  });
});
