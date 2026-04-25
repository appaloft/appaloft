import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  EnvironmentEffectivePrecedenceQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
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
      requestId: input.requestId ?? "req_orpc_environment_precedence_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("environment effective precedence HTTP route", () => {
  test("[ENV-PRECEDENCE-ENTRY-002] dispatches EnvironmentEffectivePrecedenceQuery through oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "environments.effective-precedence/v1",
          environmentId: "env_production",
          projectId: "prj_demo",
          ownedEntries: [],
          effectiveEntries: [],
          precedence: [
            "defaults",
            "system",
            "organization",
            "project",
            "environment",
            "resource",
            "deployment",
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
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
      new Request("http://localhost/api/environments/env_production/effective-precedence", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "environments.effective-precedence/v1",
      environmentId: "env_production",
      projectId: "prj_demo",
      ownedEntries: [],
      effectiveEntries: [],
      precedence: [
        "defaults",
        "system",
        "organization",
        "project",
        "environment",
        "resource",
        "deployment",
      ],
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(capturedQuery).toBeInstanceOf(EnvironmentEffectivePrecedenceQuery);
    expect(capturedQuery).toMatchObject({
      environmentId: "env_production",
    });
  });
});
