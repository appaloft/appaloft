import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  ArchiveProjectCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  RenameProjectCommand,
  ShowProjectQuery,
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
      requestId: input.requestId ?? "req_orpc_project_lifecycle_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("project lifecycle HTTP routes", () => {
  test("[PROJ-LIFE-ENTRY-HTTP-001] dispatches ShowProjectQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          id: "prj_demo",
          name: "Demo Project",
          slug: "demo-project",
          lifecycleStatus: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(new Request("http://localhost/api/projects/prj_demo"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "prj_demo",
      lifecycleStatus: "active",
    });
    expect(capturedQuery).toBeInstanceOf(ShowProjectQuery);
    expect(capturedQuery).toMatchObject({ projectId: "prj_demo" });
  });

  test("[PROJ-LIFE-ENTRY-HTTP-002] dispatches RenameProjectCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "prj_demo" } as T);
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
      new Request("http://localhost/api/projects/prj_demo/rename", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "prj_demo",
          name: "Customer API",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "prj_demo" });
    expect(capturedCommand).toBeInstanceOf(RenameProjectCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_demo",
      name: "Customer API",
    });
  });

  test("[PROJ-LIFE-ENTRY-HTTP-003] dispatches ArchiveProjectCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "prj_demo" } as T);
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
      new Request("http://localhost/api/projects/prj_demo/archive", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "prj_demo",
          reason: "Retired after migration",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "prj_demo" });
    expect(capturedCommand).toBeInstanceOf(ArchiveProjectCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_demo",
      reason: "Retired after migration",
    });
  });
});
