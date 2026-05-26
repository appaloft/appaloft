import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListIntegrationsQuery,
  type Query,
  type QueryBus,
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
      requestId: input.requestId ?? "req_orpc_integrations_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("integration catalog HTTP route", () => {
  test("[INTEGRATION-SOURCE-001] lists neutral integration connection modes", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          items: [
            {
              key: "github",
              title: "GitHub",
              capabilities: ["repository-import", "webhook-ready"],
              defaultConnectionModeKey: "user-oauth",
              connectionModes: [
                {
                  key: "user-oauth",
                  title: "User OAuth",
                  audience: "end-user",
                  externalSetup: "none",
                  createsExternalResources: false,
                  secretMaterialRequired: false,
                },
              ],
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: {
        execute: async <T>(): Promise<Result<T>> => ok({} as T),
      } as CommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(new Request("http://localhost/api/integrations"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          key: "github",
          title: "GitHub",
          capabilities: ["repository-import", "webhook-ready"],
          defaultConnectionModeKey: "user-oauth",
          connectionModes: [
            {
              key: "user-oauth",
              title: "User OAuth",
              audience: "end-user",
              externalSetup: "none",
              createsExternalResources: false,
              secretMaterialRequired: false,
            },
          ],
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListIntegrationsQuery);
  });
});
