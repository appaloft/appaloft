import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  PruneSourceEventsCommand,
  type Query,
  type QueryBus,
  ReplaySourceEventCommand,
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
      requestId: input.requestId ?? "req_orpc_source_events_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("source event HTTP routes", () => {
  test("[SRC-AUTO-REPLAY-002] replays a source event through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "source-events.replay/v1",
          sourceEventId: "sevt_demo",
          status: "dispatched",
          matchedResourceIds: ["res_web"],
          createdDeploymentIds: ["dep_replay"],
          ignoredReasons: [],
          replayedAt: "2026-05-16T00:00:00.000Z",
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
      new Request("http://localhost/api/source-events/sevt_demo/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceEventId: "sevt_demo",
          resourceId: "res_web",
          idempotencyKey: "replay_once",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "source-events.replay/v1",
      sourceEventId: "sevt_demo",
      status: "dispatched",
      createdDeploymentIds: ["dep_replay"],
    });
    expect(capturedCommand).toBeInstanceOf(ReplaySourceEventCommand);
    expect(capturedCommand).toMatchObject({
      sourceEventId: "sevt_demo",
      resourceId: "res_web",
      idempotencyKey: "replay_once",
    });
  });

  test("[SRC-AUTO-PRUNE-003] prunes source events through HTTP command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "source-events.prune/v1",
          before: "2026-01-01T00:00:00.000Z",
          resourceId: "res_web",
          status: "failed",
          dryRun: true,
          matchedCount: 2,
          prunedCount: 0,
          countsByStatus: { failed: 2 },
          countsBySourceKind: { github: 2 },
          prunedAt: "2026-05-16T00:00:00.000Z",
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
      new Request("http://localhost/api/source-events/prune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          before: "2026-01-01T00:00:00.000Z",
          resourceId: "res_web",
          status: "failed",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "source-events.prune/v1",
      before: "2026-01-01T00:00:00.000Z",
      resourceId: "res_web",
      status: "failed",
      dryRun: true,
      matchedCount: 2,
      prunedCount: 0,
    });
    expect(capturedCommand).toBeInstanceOf(PruneSourceEventsCommand);
    expect(capturedCommand).toMatchObject({
      before: "2026-01-01T00:00:00.000Z",
      resourceId: "res_web",
      status: "failed",
      dryRun: true,
    });
  });
});
