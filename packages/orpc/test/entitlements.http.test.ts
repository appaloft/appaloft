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
  QueryEntitlementsQuery,
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
      requestId: input.requestId ?? "req_orpc_entitlement_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("entitlement HTTP routes", () => {
  test("[CLOUD-ENTITLE-QUERY-005] dispatches batch entitlement query through oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          entitlements: [
            {
              capabilityKey: "static-artifacts.publish",
              entitled: false,
              status: "unknown",
              mode: "unknown",
              hint: "disabled",
              reason: "future-capability",
              source: "default",
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
      new Request("http://localhost/api/entitlements/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          queries: [
            {
              capabilityKey: "static-artifacts.publish",
              organizationId: "org_demo",
              resourceRefs: { projectId: "prj_demo" },
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entitlements: [
        {
          capabilityKey: "static-artifacts.publish",
          entitled: false,
          status: "unknown",
          mode: "unknown",
          hint: "disabled",
          reason: "future-capability",
          source: "default",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(QueryEntitlementsQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        queries: [
          {
            capabilityKey: "static-artifacts.publish",
            organizationId: "org_demo",
            resourceRefs: { projectId: "prj_demo" },
          },
        ],
      },
    });
  });
});
