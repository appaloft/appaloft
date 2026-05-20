import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  QueryCapabilitiesQuery,
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

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_capability_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
    });
  }
}

describe("capability HTTP routes", () => {
  test("[OP-CAP-HTTP-001] dispatches batch capability query through oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          capabilities: [
            {
              operationKey: "projects.rename",
              allowed: false,
              mode: "denied",
              hint: "disabled",
              reason: "viewer-read-only",
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/capabilities/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          queries: [{ operationKey: "projects.rename", resourceRefs: { projectId: "prj_demo" } }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      capabilities: [
        {
          operationKey: "projects.rename",
          allowed: false,
          mode: "denied",
          hint: "disabled",
          reason: "viewer-read-only",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(QueryCapabilitiesQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        queries: [{ operationKey: "projects.rename", resourceRefs: { projectId: "prj_demo" } }],
      },
    });
  });
});
