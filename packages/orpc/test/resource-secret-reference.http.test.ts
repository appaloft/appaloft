import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateResourceSecretReferenceCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListResourceSecretReferencesQuery,
  type ProductSessionAuthorizationPort,
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
      requestId: input.requestId ?? "req_orpc_resource_secret_reference_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      requestSecurity: input.requestSecurity,
    });
  }
}

const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: {
        kind: "user",
        id: "usr_resource_secret_test",
        label: "resource-secret@example.test",
      },
      email: "resource-secret@example.test",
      organizationId: input.organizationId ?? "org_resource_secret_test",
      role: input.requiredRole,
      userId: "usr_resource_secret_test",
    }),
};

function productRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", headers.get("cookie") ?? "better-auth.session_token=resource-secret-test");
  return new Request(url, { ...init, headers });
}

function mountResourceSecretRoutes(input: { commandBus: CommandBus; queryBus: QueryBus }): Elysia {
  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus: input.commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    productSessionAuthorizationPort,
    queryBus: input.queryBus,
  });
}

describe("resource secret reference HTTP routes", () => {
  test("[RES-SECRET-HTTP-001] creates a resource secret reference through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const app = mountResourceSecretRoutes({
      commandBus: {
        execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
          capturedCommand = command as Command<unknown>;
          return ok({
            resourceId: "res_platform",
            key: "BETTER_AUTH_SECRET",
            exposure: "runtime",
          } as T);
        },
      } as CommandBus,
      queryBus: {
        execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
          ok({} as T),
      } as QueryBus,
    });

    const response = await app.handle(
      productRequest("http://localhost/api/resources/res_platform/secrets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: "res_platform",
          key: "BETTER_AUTH_SECRET",
          value: "secret-value",
          exposure: "runtime",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      resourceId: "res_platform",
      key: "BETTER_AUTH_SECRET",
      exposure: "runtime",
    });
    expect(capturedCommand).toBeInstanceOf(CreateResourceSecretReferenceCommand);
  });

  test("[RES-SECRET-HTTP-002] lists masked resource secret references through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountResourceSecretRoutes({
      commandBus: {
        execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
          ok({} as T),
      } as CommandBus,
      queryBus: {
        execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedQuery = query as Query<unknown>;
          return ok({
            schemaVersion: "resources.secrets.list/v1",
            resourceId: "res_platform",
            items: [],
            generatedAt: "2026-07-19T00:00:00.000Z",
          } as T);
        },
      } as QueryBus,
    });

    const response = await app.handle(
      productRequest("http://localhost/api/resources/res_platform/secrets?exposure=runtime"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "resources.secrets.list/v1",
      resourceId: "res_platform",
      items: [],
      generatedAt: "2026-07-19T00:00:00.000Z",
    });
    expect(capturedQuery).toBeInstanceOf(ListResourceSecretReferencesQuery);
  });
});
