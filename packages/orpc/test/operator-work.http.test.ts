import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListOperatorWorkQuery,
  type Query,
  type QueryBus,
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
});
