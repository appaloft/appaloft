import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureRetentionDefaultsCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListRetentionDefaultsQuery,
  type Query,
  type QueryBus,
  ShowRetentionDefaultQuery,
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
      requestId: input.requestId ?? "req_orpc_retention_defaults_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("retention defaults HTTP routes", () => {
  test("[ORG-RETENTION-DEFAULTS-005] configures defaults through command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "rdf_domain_events" } as T);
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
      new Request("http://localhost/api/retention-defaults", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "organization",
          organizationId: "org_primary",
          category: "domain-event-streams",
          retentionDays: 90,
          dryRunSchedulingEnabled: true,
          destructiveSchedulingEnabled: true,
          enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "rdf_domain_events" });
    expect(capturedCommand).toBeInstanceOf(ConfigureRetentionDefaultsCommand);
    expect(capturedCommand).toMatchObject({
      input: {
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
        retentionDays: 90,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: true,
        enabled: true,
      },
    });
  });

  test("[ORG-RETENTION-DEFAULTS-005] lists defaults through query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "retention-defaults.list/v1",
          items: [
            {
              schemaVersion: "retention-defaults.policy/v1",
              id: "rdf_provider_logs",
              scope: "system",
              category: "provider-job-logs",
              retentionDays: 30,
              dryRunSchedulingEnabled: true,
              destructiveSchedulingEnabled: false,
              enabled: true,
              updatedAt: "2026-02-01T00:00:00.000Z",
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
        "http://localhost/api/retention-defaults?scope=system&category=provider-job-logs&enabledOnly=true",
        { method: "GET" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "retention-defaults.list/v1",
      items: [
        {
          id: "rdf_provider_logs",
          scope: "system",
          category: "provider-job-logs",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListRetentionDefaultsQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        scope: "system",
        category: "provider-job-logs",
        enabledOnly: true,
      },
    });
  });

  test("[ORG-RETENTION-DEFAULTS-005] shows defaults through query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "retention-defaults.show/v1",
          policy: {
            schemaVersion: "retention-defaults.policy/v1",
            id: "rdf_provider_logs",
            scope: "system",
            category: "provider-job-logs",
            retentionDays: 30,
            dryRunSchedulingEnabled: true,
            destructiveSchedulingEnabled: false,
            enabled: true,
            updatedAt: "2026-02-01T00:00:00.000Z",
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
      new Request("http://localhost/api/retention-defaults/provider-job-logs?scope=system", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "retention-defaults.show/v1",
      policy: {
        id: "rdf_provider_logs",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowRetentionDefaultQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        scope: "system",
        category: "provider-job-logs",
      },
    });
  });
});
