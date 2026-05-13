import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureScheduledRuntimePrunePolicyCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListScheduledRuntimePrunePoliciesQuery,
  type Query,
  type QueryBus,
  ShowScheduledRuntimePrunePolicyQuery,
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
      requestId: input.requestId ?? "req_orpc_scheduled_runtime_prune_policy_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("scheduled runtime prune policy HTTP routes", () => {
  test("[RT-CAP-SCHED-007] configures policy through command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "rtp_primary" } as T);
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
      new Request("http://localhost/api/servers/capacity/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyId: "rtp_primary",
          version: "v2",
          scope: "environment",
          serverId: "srv_primary",
          retentionDays: 14,
          destructive: true,
          categories: ["stopped-containers", "unused-images"],
          retryOnFailure: false,
          enabled: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "rtp_primary" });
    expect(capturedCommand).toBeInstanceOf(ConfigureScheduledRuntimePrunePolicyCommand);
    expect(capturedCommand).toMatchObject({
      input: {
        policyId: "rtp_primary",
        version: "v2",
        scope: "environment",
        serverId: "srv_primary",
        retentionDays: 14,
        destructive: true,
        categories: ["stopped-containers", "unused-images"],
        retryOnFailure: false,
        enabled: false,
      },
    });
  });

  test("[RT-CAP-SCHED-007] lists policies through query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "scheduled-runtime-prune-policies.list/v1",
          items: [
            {
              schemaVersion: "scheduled-runtime-prune-policies.policy/v1",
              id: "rtp_primary",
              version: "v1",
              scope: "project",
              serverId: "srv_primary",
              retentionDays: 7,
              destructive: false,
              categories: ["stopped-containers"],
              categoryCount: 1,
              retryOnFailure: true,
              enabled: true,
              updatedAt: "2026-01-01T00:00:00.000Z",
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
      new Request(
        "http://localhost/api/servers/capacity/policies?serverId=srv_primary&scope=project&enabledOnly=true",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "scheduled-runtime-prune-policies.list/v1",
      items: [
        {
          id: "rtp_primary",
          scope: "project",
          enabled: true,
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListScheduledRuntimePrunePoliciesQuery);
    expect(capturedQuery).toMatchObject({
      serverId: "srv_primary",
      scope: "project",
      enabledOnly: true,
    });
  });

  test("[RT-CAP-SCHED-007] shows policy through query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "scheduled-runtime-prune-policies.show/v1",
          policy: {
            schemaVersion: "scheduled-runtime-prune-policies.policy/v1",
            id: "rtp_primary",
            version: "v1",
            scope: "project",
            serverId: "srv_primary",
            retentionDays: 7,
            destructive: false,
            categories: ["stopped-containers"],
            categoryCount: 1,
            retryOnFailure: true,
            enabled: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
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
      new Request("http://localhost/api/servers/capacity/policies/rtp_primary", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "scheduled-runtime-prune-policies.show/v1",
      policy: {
        id: "rtp_primary",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowScheduledRuntimePrunePolicyQuery);
    expect(capturedQuery).toMatchObject({
      policyId: "rtp_primary",
    });
  });
});
