import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListUsageIntentRecordsQuery,
  type Query,
  type QueryBus,
  RecordUsageIntentCommand,
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
      requestId: input.requestId ?? "req_orpc_usage_intent_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("usage intent HTTP routes", () => {
  test("[CLOUD-METER-QUERY-008] records neutral usage intent through oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          result: {
            idempotencyKey: "usage-intent-http-1",
            capabilityKey: "runtime.local-development",
            accepted: true,
            duplicate: false,
            status: "accepted",
            reason: "usage-intent-default-noop",
            source: "default",
          },
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({ records: [] } as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/usage-intents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: "usage-intent-http-1",
          capabilityKey: "runtime.local-development",
          organizationId: "org_demo",
          source: "api-harness",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      result: {
        idempotencyKey: "usage-intent-http-1",
        capabilityKey: "runtime.local-development",
        accepted: true,
        duplicate: false,
        status: "accepted",
        reason: "usage-intent-default-noop",
        source: "default",
      },
    });
    expect(capturedCommand).toBeInstanceOf(RecordUsageIntentCommand);
    expect(capturedCommand).toMatchObject({
      input: {
        idempotencyKey: "usage-intent-http-1",
        capabilityKey: "runtime.local-development",
        organizationId: "org_demo",
        source: "api-harness",
      },
    });
  });

  test("[CLOUD-METER-QUERY-008] lists neutral usage intent records through oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          records: [
            {
              schemaVersion: "usage-intent.record/v1",
              id: "usage_record_http_1",
              idempotencyKey: "usage-intent-http-1",
              capabilityKey: "runtime.local-development",
              status: "accepted",
              reason: "test",
              source: "test",
              tenantId: "tenant_demo",
              occurredAt: "2026-05-20T00:00:00.000Z",
              recordedAt: "2026-05-20T00:00:01.000Z",
            },
          ],
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
      new Request("http://localhost/api/usage-intents?tenantId=tenant_demo", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      records: [
        {
          schemaVersion: "usage-intent.record/v1",
          id: "usage_record_http_1",
          idempotencyKey: "usage-intent-http-1",
          capabilityKey: "runtime.local-development",
          status: "accepted",
          reason: "test",
          source: "test",
          tenantId: "tenant_demo",
          occurredAt: "2026-05-20T00:00:00.000Z",
          recordedAt: "2026-05-20T00:00:01.000Z",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListUsageIntentRecordsQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        tenantId: "tenant_demo",
      },
    });
  });
});
