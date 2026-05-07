import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigurePreviewPolicyCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  ShowPreviewPolicyQuery,
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
      requestId: input.requestId ?? "req_orpc_preview_policy_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

const resourcePolicyScope = {
  kind: "resource" as const,
  projectId: "prj_demo",
  resourceId: "res_api",
};

const previewPolicySettings = {
  sameRepositoryPreviews: true,
  forkPreviews: "without-secrets" as const,
  secretBackedPreviews: false,
  maxActivePreviews: 5,
  previewTtlHours: 24,
};

describe("preview policy HTTP route", () => {
  test("[PG-PREVIEW-SURFACE-001] dispatches ConfigurePreviewPolicyCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "ppol_demo" } as T);
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
      new Request("http://localhost/api/preview-policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scope: resourcePolicyScope,
          policy: previewPolicySettings,
          idempotencyKey: "preview-policy-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "ppol_demo" });
    expect(capturedCommand).toBeInstanceOf(ConfigurePreviewPolicyCommand);
    expect(capturedCommand).toMatchObject({
      scope: resourcePolicyScope,
      policy: previewPolicySettings,
      idempotencyKey: "preview-policy-1",
    });
  });

  test("[PG-PREVIEW-SURFACE-001] dispatches ShowPreviewPolicyQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "preview-policies.show/v1",
          generatedAt: "2026-05-06T03:00:00.000Z",
          policy: {
            id: "ppol_demo",
            scope: resourcePolicyScope,
            source: "configured",
            settings: previewPolicySettings,
            updatedAt: "2026-05-06T02:59:00.000Z",
          },
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
      new Request("http://localhost/api/preview-policies/show", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scope: resourcePolicyScope,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "preview-policies.show/v1",
      generatedAt: "2026-05-06T03:00:00.000Z",
      policy: {
        id: "ppol_demo",
        scope: resourcePolicyScope,
        source: "configured",
        settings: previewPolicySettings,
        updatedAt: "2026-05-06T02:59:00.000Z",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowPreviewPolicyQuery);
    expect(capturedQuery).toMatchObject({
      scope: resourcePolicyScope,
    });
  });
});
