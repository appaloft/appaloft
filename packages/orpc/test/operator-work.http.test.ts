import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CancelOperatorWorkCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeadLetterOperatorWorkCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListOperatorWorkQuery,
  MarkOperatorWorkRecoveredCommand,
  PruneOperatorWorkCommand,
  type Query,
  type QueryBus,
  RetryOperatorWorkCommand,
  ShowOperatorWorkQuery,
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
      requestId: input.requestId ?? "req_orpc_operator_work_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("operator work HTTP routes", () => {
  test("[OP-WORK-HTTP-001] lists operator work through HTTP query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "operator-work.list/v1",
          items: [
            {
              id: "dep_failed",
              kind: "deployment",
              status: "failed",
              operationKey: "deployments.create",
              resourceId: "res_web",
              serverId: "srv_primary",
              deploymentId: "dep_failed",
              updatedAt: "2026-01-01T00:00:09.000Z",
              nextActions: ["diagnostic", "manual-review"],
            },
          ],
          generatedAt: "2026-01-01T00:00:10.000Z",
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
        "http://localhost/api/operator-work?kind=deployment&status=failed&resourceId=res_web&serverId=srv_primary&deploymentId=dep_failed&limit=5",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "operator-work.list/v1",
      items: [
        {
          id: "dep_failed",
          kind: "deployment",
          status: "failed",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListOperatorWorkQuery);
    expect(capturedQuery).toMatchObject({
      kind: "deployment",
      status: "failed",
      resourceId: "res_web",
      serverId: "srv_primary",
      deploymentId: "dep_failed",
      limit: 5,
    });
  });

  test("[OP-WORK-HTTP-002] shows a single operator work item through HTTP query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "operator-work.show/v1",
          item: {
            id: "dep_failed",
            kind: "deployment",
            status: "failed",
            operationKey: "deployments.create",
            updatedAt: "2026-01-01T00:00:09.000Z",
            nextActions: ["diagnostic"],
          },
          generatedAt: "2026-01-01T00:00:10.000Z",
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
      new Request("http://localhost/api/operator-work/dep_failed", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "operator-work.show/v1",
      item: {
        id: "dep_failed",
        kind: "deployment",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowOperatorWorkQuery);
    expect(capturedQuery).toMatchObject({
      workId: "dep_failed",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-005] marks operator work recovered through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          workId: "wrk_failed",
          status: "succeeded",
          recoveredAt: "2026-01-01T00:10:00.000Z",
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
      new Request("http://localhost/api/operator-work/wrk_failed/mark-recovered", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workId: "wrk_failed",
          reason: "fixed target permissions",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workId: "wrk_failed",
      status: "succeeded",
      recoveredAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(MarkOperatorWorkRecoveredCommand);
    expect(capturedCommand).toMatchObject({
      workId: "wrk_failed",
      reason: "fixed target permissions",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-007] dead-letters operator work through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          workId: "wrk_failed",
          status: "dead-lettered",
          deadLetteredAt: "2026-01-01T00:10:00.000Z",
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
      new Request("http://localhost/api/operator-work/wrk_failed/dead-letter", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workId: "wrk_failed",
          reason: "external dependency requires vendor support",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workId: "wrk_failed",
      status: "dead-lettered",
      deadLetteredAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(DeadLetterOperatorWorkCommand);
    expect(capturedCommand).toMatchObject({
      workId: "wrk_failed",
      reason: "external dependency requires vendor support",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-009] cancels operator work through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          workId: "wrk_pending",
          status: "canceled",
          canceledAt: "2026-01-01T00:10:00.000Z",
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
      new Request("http://localhost/api/operator-work/wrk_pending/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workId: "wrk_pending",
          reason: "operator stopped queued work",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workId: "wrk_pending",
      status: "canceled",
      canceledAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(CancelOperatorWorkCommand);
    expect(capturedCommand).toMatchObject({
      workId: "wrk_pending",
      reason: "operator stopped queued work",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-011] retries operator work through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          workId: "wrk_retry_next",
          status: "pending",
          retryOfWorkId: "wrk_failed",
          retriedAt: "2026-01-01T00:10:00.000Z",
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
      new Request("http://localhost/api/operator-work/wrk_failed/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workId: "wrk_failed",
          reason: "operator confirmed dependency is healthy",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workId: "wrk_retry_next",
      status: "pending",
      retryOfWorkId: "wrk_failed",
      retriedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(RetryOperatorWorkCommand);
    expect(capturedCommand).toMatchObject({
      workId: "wrk_failed",
      reason: "operator confirmed dependency is healthy",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-013] prunes operator work through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          prunedCount: 2,
          matchedCount: 2,
          dryRun: false,
          before: "2026-01-01T00:05:00.000Z",
          statuses: ["failed", "canceled"],
          countsByStatus: {
            failed: 1,
            canceled: 1,
          },
          prunedAt: "2026-01-01T00:10:00.000Z",
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
      new Request("http://localhost/api/operator-work/prune", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          before: "2026-01-01T00:05:00.000Z",
          statuses: ["failed", "canceled"],
          dryRun: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      prunedCount: 2,
      matchedCount: 2,
      dryRun: false,
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed", "canceled"],
      countsByStatus: {
        failed: 1,
        canceled: 1,
      },
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(PruneOperatorWorkCommand);
    expect(capturedCommand).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed", "canceled"],
      dryRun: false,
    });
  });
});
