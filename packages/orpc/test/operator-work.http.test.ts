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
  type ProductSessionAuthorizationPort,
  PruneOperatorWorkCommand,
  type Query,
  type QueryBus,
  RetryOperatorWorkCommand,
  ShowOperatorWorkQuery,
  StreamOperatorWorkEventsQuery,
} from "@appaloft/application";
import { type OperatorWorkEventStreamResponse } from "@appaloft/contracts";
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
      principal: input.principal,
    });
  }
}

const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: {
        kind: "user",
        id: "usr_operator",
        label: "operator@example.test",
      },
      email: "operator@example.test",
      organizationId: input.organizationId ?? "org_operator_work_test",
      role: input.requiredRole,
      userId: "usr_operator",
    }),
};

function mountOperatorWorkRoutes(input: { commandBus: CommandBus; queryBus: QueryBus }): Elysia {
  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus: input.commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    productSessionAuthorizationPort,
    queryBus: input.queryBus,
  });
}

function operatorWorkRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", headers.get("cookie") ?? "better-auth.session_token=operator-work-test");

  return new Request(url, {
    ...init,
    headers,
  });
}

function operatorWorkEventReplay(): OperatorWorkEventStreamResponse {
  return {
    workId: "wrk_blueprint_install",
    envelopes: [
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "progress",
        event: {
          workId: "wrk_blueprint_install",
          sequence: 2,
          cursor: "wrk_blueprint_install:2",
          emittedAt: "2026-01-01T00:00:03.000Z",
          kind: "progress",
          status: "running",
          operationKey: "blueprints.install",
          workKind: "blueprint-install",
          phase: "install",
          step: "deploy-components",
          message: "Deploying components.",
          projectId: "prj_demo",
        },
      },
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "wrk_blueprint_install:2",
      },
    ],
  };
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest(
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest("http://localhost/api/operator-work/dep_failed", { method: "GET" }),
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

  test("[OP-WORK-ENTRY-003B] replays operator work parent status events through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          mode: "bounded",
          workId: "wrk_blueprint_install",
          envelopes: operatorWorkEventReplay().envelopes,
        } as T);
      },
    } as QueryBus;
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest(
        "http://localhost/api/operator-work/wrk_blueprint_install/events?historyLimit=25&includeHistory=true",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(operatorWorkEventReplay());
    expect(capturedQuery).toBeInstanceOf(StreamOperatorWorkEventsQuery);
    expect(capturedQuery).toMatchObject({
      workId: "wrk_blueprint_install",
      historyLimit: 25,
      includeHistory: true,
      follow: false,
      untilTerminal: true,
    });
  });

  test("[OP-WORK-ENTRY-003B] streams operator work parent status envelopes as SSE", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          mode: "bounded",
          workId: "wrk_blueprint_install",
          envelopes: operatorWorkEventReplay().envelopes,
        } as T);
      },
    } as QueryBus;
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest(
        "http://localhost/api/operator-work/wrk_blueprint_install/events/stream?historyLimit=25&includeHistory=true",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain('"schemaVersion":"operator-work.stream-events/v1"');
    expect(body).toContain('"kind":"progress"');
    expect(body).toContain('"kind":"closed"');
    expect(capturedQuery).toBeInstanceOf(StreamOperatorWorkEventsQuery);
    expect(capturedQuery).toMatchObject({
      workId: "wrk_blueprint_install",
      historyLimit: 25,
      includeHistory: true,
      follow: true,
      untilTerminal: true,
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest("http://localhost/api/operator-work/wrk_failed/mark-recovered", {
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest("http://localhost/api/operator-work/wrk_failed/dead-letter", {
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest("http://localhost/api/operator-work/wrk_pending/cancel", {
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest("http://localhost/api/operator-work/wrk_failed/retry", {
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
    const app = mountOperatorWorkRoutes({ commandBus, queryBus });

    const response = await app.handle(
      operatorWorkRequest("http://localhost/api/operator-work/prune", {
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
