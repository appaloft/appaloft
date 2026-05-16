import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateResourceSecretReferenceCommand,
  createExecutionContext,
  DeleteResourceSecretReferenceCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ImportResourceVariablesCommand,
  ListResourceSecretReferencesQuery,
  type Query,
  type QueryBus,
  ResourceEffectiveConfigQuery,
  RotateResourceSecretReferenceCommand,
  SetResourceVariableCommand,
  ShowResourceSecretReferenceQuery,
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

  test("[RES-PROFILE-ENTRY-016] dispatches ImportResourceVariablesCommand through oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          resourceId: "res_web",
          importedEntries: [],
          duplicateOverrides: [],
          existingOverrides: [],
        } as T);
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
      new Request("http://localhost/api/rpc/resources/importVariables", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            resourceId: "res_web",
            content: "DATABASE_URL=postgres://secret",
            exposure: "runtime",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      json: {
        resourceId: "res_web",
        importedEntries: [],
        duplicateOverrides: [],
        existingOverrides: [],
      },
    });
    expect(capturedCommand).toBeInstanceOf(ImportResourceVariablesCommand);
    expect(capturedCommand).toMatchObject({
      resourceId: "res_web",
      content: "DATABASE_URL=postgres://secret",
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
          overrides: [],
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
        overrides: [],
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

  test("[RES-SECRET-CRUD-006] dispatches resource secret CRUD commands through oRPC", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommands.push(command as Command<unknown>);
        return ok({
          resourceId: "res_web",
          key: "WEBHOOK_SECRET",
          exposure: "runtime",
        } as T);
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

    for (const [path, body] of [
      [
        "create",
        {
          resourceId: "res_web",
          key: "WEBHOOK_SECRET",
          value: "secret",
          exposure: "runtime",
        },
      ],
      [
        "rotate",
        {
          resourceId: "res_web",
          key: "WEBHOOK_SECRET",
          value: "rotated",
          exposure: "runtime",
        },
      ],
      [
        "delete",
        {
          resourceId: "res_web",
          key: "WEBHOOK_SECRET",
          exposure: "runtime",
        },
      ],
    ] as const) {
      const response = await app.handle(
        new Request(`http://localhost/api/rpc/resources/secrets/${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ json: body }),
        }),
      );
      expect(response.status).toBe(200);
    }

    expect(capturedCommands[0]).toBeInstanceOf(CreateResourceSecretReferenceCommand);
    expect(capturedCommands[1]).toBeInstanceOf(RotateResourceSecretReferenceCommand);
    expect(capturedCommands[2]).toBeInstanceOf(DeleteResourceSecretReferenceCommand);
  });

  test("[RES-SECRET-CRUD-007] dispatches resource secret list/show queries through oRPC", async () => {
    const capturedQueries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQueries.push(query as Query<unknown>);
        if (query instanceof ListResourceSecretReferencesQuery) {
          return ok({
            schemaVersion: "resources.secrets.list/v1",
            resourceId: "res_web",
            items: [],
            generatedAt: "2026-01-01T00:00:00.000Z",
          } as T);
        }
        return ok({
          schemaVersion: "resources.secrets.show/v1",
          secret: {
            resourceId: "res_web",
            key: "WEBHOOK_SECRET",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
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

    const listResponse = await app.handle(
      new Request("http://localhost/api/rpc/resources/secrets/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ json: { resourceId: "res_web" } }),
      }),
    );
    expect(listResponse.status).toBe(200);

    const showResponse = await app.handle(
      new Request("http://localhost/api/rpc/resources/secrets/show", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: { resourceId: "res_web", key: "WEBHOOK_SECRET", exposure: "runtime" },
        }),
      }),
    );
    expect(showResponse.status).toBe(200);

    expect(capturedQueries[0]).toBeInstanceOf(ListResourceSecretReferencesQuery);
    expect(capturedQueries[1]).toBeInstanceOf(ShowResourceSecretReferenceQuery);
  });
});
