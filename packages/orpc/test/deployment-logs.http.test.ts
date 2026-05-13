import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeploymentLogsQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  PruneDeploymentLogsCommand,
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
      requestId: input.requestId ?? "req_orpc_deployment_logs_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("deployment log HTTP routes", () => {
  test("[DEP-LOG-PRUNE-004] dispatches shared deployment log prune command", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "deployments.logs.prune/v1",
          before: "2026-01-01T00:05:00.000Z",
          deploymentId: "dep_primary",
          resourceId: "res_web",
          serverId: "srv_primary",
          dryRun: false,
          matchedCount: 1,
          prunedCount: 1,
          affectedDeploymentCount: 1,
          prunedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/logs/prune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          before: "2026-01-01T00:05:00.000Z",
          deploymentId: "dep_primary",
          resourceId: "res_web",
          serverId: "srv_primary",
          dryRun: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "deployments.logs.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: "dep_primary",
      resourceId: "res_web",
      serverId: "srv_primary",
      dryRun: false,
      matchedCount: 1,
      prunedCount: 1,
      affectedDeploymentCount: 1,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(PruneDeploymentLogsCommand);
    expect(capturedCommand).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: "dep_primary",
      resourceId: "res_web",
      serverId: "srv_primary",
      dryRun: false,
    });
  });

  test("keeps deployment log read route on DeploymentLogsQuery", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          deploymentId: "dep_primary",
          logs: [],
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
      new Request("http://localhost/api/deployments/dep_primary/logs"),
    );

    expect(response.status).toBe(200);
    expect(capturedQuery).toBeInstanceOf(DeploymentLogsQuery);
  });
});
