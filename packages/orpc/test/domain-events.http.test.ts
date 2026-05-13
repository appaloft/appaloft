import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  PruneDomainEventsCommand,
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
      requestId: input.requestId ?? "req_orpc_domain_events_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("domain event HTTP routes", () => {
  test("[DOMAIN-EVENT-RETENTION-004] dispatches shared domain event prune command", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "domain-events.prune/v1",
          before: "2026-01-01T00:05:00.000Z",
          eventType: "deployment.finished",
          aggregateId: "dep_primary",
          aggregateType: "deployment",
          deploymentId: "dep_primary",
          limit: 50,
          dryRun: false,
          inspectedCount: 1,
          candidateCount: 1,
          prunedCount: 1,
          skippedCount: 0,
          countsByEventType: {
            "deployment.finished": 1,
          },
          skippedCountsByReason: {},
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
      new Request("http://localhost/api/domain-events/prune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          before: "2026-01-01T00:05:00.000Z",
          eventType: "deployment.finished",
          aggregateId: "dep_primary",
          aggregateType: "deployment",
          deploymentId: "dep_primary",
          limit: 50,
          dryRun: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "domain-events.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      eventType: "deployment.finished",
      aggregateId: "dep_primary",
      aggregateType: "deployment",
      deploymentId: "dep_primary",
      limit: 50,
      dryRun: false,
      inspectedCount: 1,
      candidateCount: 1,
      prunedCount: 1,
      skippedCount: 0,
      countsByEventType: {
        "deployment.finished": 1,
      },
      skippedCountsByReason: {},
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(PruneDomainEventsCommand);
    expect(capturedCommand).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      eventType: "deployment.finished",
      aggregateId: "dep_primary",
      aggregateType: "deployment",
      deploymentId: "dep_primary",
      limit: 50,
      dryRun: false,
    });
  });
});
