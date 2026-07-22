import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureResourceAutoDeployCommand,
  ConfigureResourceSourceCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
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
      requestId: input.requestId ?? "req_orpc_resource_source_profile_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
    });
  }
}

const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: { kind: "user", id: "usr_source_profile", label: "source@example.test" },
      email: "source@example.test",
      organizationId: input.organizationId ?? "org_source_profile",
      role: input.requiredRole,
      userId: "usr_source_profile",
    }),
};

function resourceSourceRequest(url: string, init: RequestInit): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", "better-auth.session_token=resource-source-profile-test");
  return new Request(url, { ...init, headers });
}

describe("resource source profile HTTP route", () => {
  test("[SRC-AUTO-ROUNDTRIP-001] dispatches every supported auto-deploy field through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          resourceId: "res_web",
          status: "enabled",
          triggerKind: "git-push",
          refs: ["main", "release/*"],
          eventKinds: ["push"],
          includePaths: ["apps/web/**"],
          excludePaths: ["apps/web/docs/**"],
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
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      resourceSourceRequest("http://localhost/api/resources/res_web/auto-deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: "res_web",
          mode: "replace",
          policy: {
            triggerKind: "git-push",
            refs: ["main", "release/*"],
            eventKinds: ["push"],
            includePaths: ["apps/web/**"],
            excludePaths: ["apps/web/docs/**"],
            dedupeWindowSeconds: 120,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(capturedCommand).toBeInstanceOf(ConfigureResourceAutoDeployCommand);
    expect(capturedCommand).toMatchObject({
      resourceId: "res_web",
      mode: "replace",
      policy: {
        triggerKind: "git-push",
        refs: ["main", "release/*"],
        eventKinds: ["push"],
        includePaths: ["apps/web/**"],
        excludePaths: ["apps/web/docs/**"],
        dedupeWindowSeconds: 120,
      },
    });
  });

  test("[RES-PROFILE-ENTRY-002] dispatches ConfigureResourceSourceCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "res_web" } as T);
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
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      resourceSourceRequest("http://localhost/api/resources/res_web/source", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          resourceId: "res_web",
          source: {
            kind: "git-public",
            locator: "https://github.com/acme/web.git",
            gitRef: "main",
            baseDirectory: "/apps/web",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "res_web" });
    expect(capturedCommand).toBeInstanceOf(ConfigureResourceSourceCommand);
  });
});
