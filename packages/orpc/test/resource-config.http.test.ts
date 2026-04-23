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
  ResourceEffectiveConfigQuery,
  SetResourceVariableCommand,
  UnsetResourceVariableCommand,
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
      requestId: input.requestId ?? "req_orpc_resource_config_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("resource config HTTP routes", () => {
  test("[RES-PROFILE-ENTRY-004] dispatches SetResourceVariableCommand through oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok(null as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/rpc/resources/setVariable", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            resourceId: "res_web",
            key: "DATABASE_URL",
            value: "postgres://resource",
            kind: "secret",
            exposure: "runtime",
            isSecret: true,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      json: null,
    });
    expect(capturedCommand).toBeInstanceOf(SetResourceVariableCommand);
    expect(capturedCommand).toMatchObject({
      resourceId: "res_web",
      key: "DATABASE_URL",
      value: "postgres://resource",
      kind: "secret",
      exposure: "runtime",
      isSecret: true,
    });
  });

  test("[RES-PROFILE-ENTRY-004] dispatches UnsetResourceVariableCommand through oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok(null as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/rpc/resources/unsetVariable", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            resourceId: "res_web",
            key: "DATABASE_URL",
            exposure: "runtime",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      json: null,
    });
    expect(capturedCommand).toBeInstanceOf(UnsetResourceVariableCommand);
    expect(capturedCommand).toMatchObject({
      resourceId: "res_web",
      key: "DATABASE_URL",
      exposure: "runtime",
    });
  });

  test("[RES-PROFILE-ENTRY-004] dispatches ResourceEffectiveConfigQuery through oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "resources.effective-config/v1",
          resourceId: "res_web",
          environmentId: "env_demo",
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
      new Request("http://localhost/api/rpc/resources/effectiveConfig", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            resourceId: "res_web",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      json: {
        schemaVersion: "resources.effective-config/v1",
        resourceId: "res_web",
        environmentId: "env_demo",
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
      },
    });
    expect(capturedQuery).toBeInstanceOf(ResourceEffectiveConfigQuery);
    expect(capturedQuery).toMatchObject({
      resourceId: "res_web",
    });
  });
});
