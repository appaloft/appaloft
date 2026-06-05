import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  ArchiveProjectCommand,
  CheckProjectDeleteSafetyQuery,
  type Command,
  type CommandBus,
  CountProjectsQuery,
  createExecutionContext,
  DeleteProjectCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  RenameProjectCommand,
  RestoreProjectCommand,
  SetProjectDescriptionCommand,
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
      principal: input.principal,
      requestSecurity: input.requestSecurity,
    });
  }
}

describe("project lifecycle HTTP routes", () => {
  test("[READ-MODEL-COUNT-003] dispatches CountProjectsQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({ count: 3 } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(new Request("http://localhost/api/projects/count"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 3 });
    expect(capturedQuery).toBeInstanceOf(CountProjectsQuery);
  });

  test("[OP-GUARD-005] carries neutral request security headers into oRPC HTTP execution context", async () => {
    let capturedContext: ExecutionContext | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(context: ExecutionContext, _query: Query<T>): Promise<Result<T>> => {
        capturedContext = context;
        return ok({ count: 3 } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects/count", {
        headers: {
          "x-appaloft-edge-action": "managed_challenge",
          "x-appaloft-edge-provider": "edge-fixture",
          "x-appaloft-edge-ray-id": "ray_fixture",
          "x-appaloft-edge-rule-id": "rule_fixture",
          "x-appaloft-bot-score": "7",
          "x-appaloft-fraud-risk-score": "95",
          "x-request-id": "req_orpc_request_security",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(capturedContext).toMatchObject({
      entrypoint: "http",
      requestId: "req_orpc_request_security",
      requestSecurity: {
        botScore: 7,
        edgeAction: "managed_challenge",
        edgeProvider: "edge-fixture",
        edgeRayId: "ray_fixture",
        edgeRuleId: "rule_fixture",
        fraudRiskScore: 95,
      },
    });
  });

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

  test("[PROJ-LIFE-ENTRY-HTTP-004] dispatches RestoreProjectCommand through HTTP", async () => {
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
      new Request("http://localhost/api/projects/prj_demo/restore", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "prj_demo",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "prj_demo" });
    expect(capturedCommand).toBeInstanceOf(RestoreProjectCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_demo",
    });
  });

  test("[PROJ-LIFE-ENTRY-HTTP-005] dispatches CheckProjectDeleteSafetyQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "projects.delete-check/v1",
          projectId: "prj_demo",
          lifecycleStatus: "archived",
          eligible: true,
          blockers: [],
          checkedAt: "2026-01-01T00:00:00.000Z",
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
      new Request("http://localhost/api/projects/prj_demo/delete-check"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "projects.delete-check/v1",
      projectId: "prj_demo",
      eligible: true,
    });
    expect(capturedQuery).toBeInstanceOf(CheckProjectDeleteSafetyQuery);
    expect(capturedQuery).toMatchObject({ projectId: "prj_demo" });
  });

  test("[PROJ-LIFE-ENTRY-HTTP-005B] serializes project delete-check blockers through HTTP", async () => {
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({
          schemaVersion: "projects.delete-check/v1",
          projectId: "prj_demo",
          lifecycleStatus: "archived",
          eligible: false,
          blockers: [
            {
              kind: "resource",
              relatedEntityId: "res_demo",
              relatedEntityType: "resource",
              count: 1,
            },
            {
              kind: "audit-retention",
              relatedEntityId: "aud_demo",
              relatedEntityType: "audit-log",
              count: 2,
            },
          ],
          checkedAt: "2026-01-01T00:00:00.000Z",
        } as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects/prj_demo/delete-check"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "projects.delete-check/v1",
      projectId: "prj_demo",
      eligible: false,
      blockers: [
        {
          kind: "resource",
          relatedEntityId: "res_demo",
          relatedEntityType: "resource",
          count: 1,
        },
        {
          kind: "audit-retention",
          relatedEntityId: "aud_demo",
          relatedEntityType: "audit-log",
          count: 2,
        },
      ],
    });
  });

  test("[PROJ-LIFE-ENTRY-HTTP-006] dispatches DeleteProjectCommand through HTTP", async () => {
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
      new Request("http://localhost/api/projects/prj_demo", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "prj_demo",
          confirmation: { projectId: "prj_demo" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "prj_demo" });
    expect(capturedCommand).toBeInstanceOf(DeleteProjectCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_demo",
      confirmation: { projectId: "prj_demo" },
    });
  });

  test("[PROJ-LIFE-ENTRY-003] dispatches SetProjectDescriptionCommand through HTTP", async () => {
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
      new Request("http://localhost/api/projects/prj_demo/description", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "prj_demo",
          description: "Customer API workspace",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "prj_demo" });
    expect(capturedCommand).toBeInstanceOf(SetProjectDescriptionCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_demo",
      description: "Customer API workspace",
    });
  });
});
