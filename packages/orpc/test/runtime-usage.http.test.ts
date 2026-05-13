import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  InspectRuntimeUsageQuery,
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
      requestId: input.requestId ?? "req_orpc_runtime_usage_inspect_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("runtime usage HTTP route", () => {
  test("[RT-USAGE-008] dispatches InspectRuntimeUsageQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "runtime-usage.inspect/v1",
          scope: { kind: "server", serverId: "srv_primary" },
          generatedAt: "2026-01-01T00:00:10.000Z",
          observedAt: "2026-01-01T00:00:05.000Z",
          freshness: "live",
          partial: false,
          totals: {
            disk: {
              totalBytes: 1000,
              usedBytes: 400,
              availableBytes: 600,
              attributedBytes: 30,
            },
          },
          byProject: [],
          byEnvironment: [],
          byResource: [],
          byDeployment: [],
          artifacts: [
            {
              kind: "active-runtime",
              ownership: "partially-attributed",
              serverId: "srv_primary",
              bytes: 30,
              evidence: [{ source: "read-model", key: "servers.capacity.inspect:runtimeRoot" }],
              reclaimable: "no",
              reclaimBlockedReason: "active-runtime",
              warnings: [],
            },
          ],
          warnings: [],
          sourceErrors: [],
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
        "http://localhost/api/runtime-usage/inspect?scope.kind=server&scope.serverId=srv_primary",
        {
          method: "GET",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "runtime-usage.inspect/v1",
      scope: {
        kind: "server",
        serverId: "srv_primary",
      },
      totals: {
        disk: {
          attributedBytes: 30,
        },
      },
    });
    expect(capturedQuery).toBeInstanceOf(InspectRuntimeUsageQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        scope: {
          kind: "server",
          serverId: "srv_primary",
        },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    });
  });
});
