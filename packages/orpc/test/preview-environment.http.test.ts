import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeletePreviewEnvironmentCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListPreviewEnvironmentsQuery,
  type Query,
  type QueryBus,
  ShowPreviewEnvironmentQuery,
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
      requestId: input.requestId ?? "req_orpc_preview_environment_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function previewEnvironmentSummary() {
  return {
    previewEnvironmentId: "prenv_preview_1",
    projectId: "prj_demo",
    environmentId: "env_preview",
    resourceId: "res_api",
    serverId: "srv_demo",
    destinationId: "dst_web",
    source: {
      provider: "github" as const,
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 42,
      baseRef: "main",
      headSha: "abc1234",
      sourceBindingFingerprint: "srcfp_pr_42",
    },
    status: "active" as const,
    createdAt: "2026-05-06T01:00:00.000Z",
    updatedAt: "2026-05-06T01:01:00.000Z",
    expiresAt: "2026-05-07T01:00:00.000Z",
  };
}

describe("preview environment HTTP route", () => {
  test("[PG-PREVIEW-SURFACE-001] dispatches ListPreviewEnvironmentsQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "preview-environments.list/v1",
          items: [previewEnvironmentSummary()],
          nextCursor: "cursor_next",
          generatedAt: "2026-05-06T01:02:00.000Z",
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
      new Request(
        "http://localhost/api/preview-environments?projectId=prj_demo&resourceId=res_api&status=active&limit=10",
        {
          method: "GET",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "preview-environments.list/v1",
      items: [previewEnvironmentSummary()],
      nextCursor: "cursor_next",
      generatedAt: "2026-05-06T01:02:00.000Z",
    });
    expect(capturedQuery).toBeInstanceOf(ListPreviewEnvironmentsQuery);
    expect(capturedQuery).toMatchObject({
      projectId: "prj_demo",
      resourceId: "res_api",
      status: "active",
      limit: 10,
    });
  });

  test("[PG-PREVIEW-SURFACE-001] dispatches ShowPreviewEnvironmentQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "preview-environments.show/v1",
          previewEnvironment: previewEnvironmentSummary(),
          generatedAt: "2026-05-06T01:03:00.000Z",
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
      new Request("http://localhost/api/preview-environments/prenv_preview_1?resourceId=res_api", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "preview-environments.show/v1",
      previewEnvironment: previewEnvironmentSummary(),
      generatedAt: "2026-05-06T01:03:00.000Z",
    });
    expect(capturedQuery).toBeInstanceOf(ShowPreviewEnvironmentQuery);
    expect(capturedQuery).toMatchObject({
      previewEnvironmentId: "prenv_preview_1",
      resourceId: "res_api",
    });
  });

  test("[PG-PREVIEW-SURFACE-001] dispatches DeletePreviewEnvironmentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          status: "cleaned",
          attemptId: "pcln_1",
          previewEnvironmentId: "prenv_preview_1",
          resourceId: "res_api",
          sourceBindingFingerprint: "srcfp_pr_42",
          previewEnvironmentStatus: "cleanup-requested",
          cleanedRuntime: true,
          removedRoute: true,
          removedSourceLink: true,
          removedProviderMetadata: false,
          updatedFeedback: false,
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
      new Request("http://localhost/api/resources/res_api/preview-environments/prenv_preview_1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: "cleaned",
      attemptId: "pcln_1",
      previewEnvironmentId: "prenv_preview_1",
      resourceId: "res_api",
      sourceBindingFingerprint: "srcfp_pr_42",
      previewEnvironmentStatus: "cleanup-requested",
      cleanedRuntime: true,
      removedRoute: true,
      removedSourceLink: true,
      removedProviderMetadata: false,
      updatedFeedback: false,
    });
    expect(capturedCommand).toBeInstanceOf(DeletePreviewEnvironmentCommand);
    expect(capturedCommand).toMatchObject({
      previewEnvironmentId: "prenv_preview_1",
      resourceId: "res_api",
    });
  });
});
