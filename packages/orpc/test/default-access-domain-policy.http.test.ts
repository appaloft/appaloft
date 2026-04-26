import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureDefaultAccessDomainPolicyCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListDefaultAccessDomainPoliciesQuery,
  type Query,
  type QueryBus,
  ShowDefaultAccessDomainPolicyQuery,
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
      requestId: input.requestId ?? "req_orpc_default_access_policy_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("default access domain policy HTTP route", () => {
  test("[DEF-ACCESS-ENTRY-006] dispatches ConfigureDefaultAccessDomainPolicyCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dap_demo" } as T);
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
      new Request("http://localhost/api/default-access-domain-policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scope: {
            kind: "deployment-target",
            serverId: "srv_demo",
          },
          mode: "provider",
          providerKey: "sslip",
          idempotencyKey: "policy-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "dap_demo" });
    expect(capturedCommand).toBeInstanceOf(ConfigureDefaultAccessDomainPolicyCommand);
  });

  test("[DEF-ACCESS-ENTRY-007] dispatches ListDefaultAccessDomainPoliciesQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "default-access-domain-policies.list/v1",
          items: [
            {
              schemaVersion: "default-access-domain-policies.policy/v1",
              id: "dap_system",
              scope: { kind: "system" },
              mode: "provider",
              providerKey: "sslip",
              updatedAt: "2026-01-01T00:00:10.000Z",
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
      new Request("http://localhost/api/default-access-domain-policies", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "default-access-domain-policies.list/v1",
      items: [
        {
          schemaVersion: "default-access-domain-policies.policy/v1",
          id: "dap_system",
          scope: { kind: "system" },
          mode: "provider",
          providerKey: "sslip",
          updatedAt: "2026-01-01T00:00:10.000Z",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListDefaultAccessDomainPoliciesQuery);
  });

  test("[DEF-ACCESS-ENTRY-007] dispatches ShowDefaultAccessDomainPolicyQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "default-access-domain-policies.show/v1",
          scope: { kind: "deployment-target", serverId: "srv_demo" },
          policy: {
            schemaVersion: "default-access-domain-policies.policy/v1",
            id: "dap_server",
            scope: { kind: "deployment-target", serverId: "srv_demo" },
            mode: "disabled",
            updatedAt: "2026-01-01T00:00:11.000Z",
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
      new Request(
        "http://localhost/api/default-access-domain-policies/show?scopeKind=deployment-target&serverId=srv_demo",
        {
          method: "GET",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "default-access-domain-policies.show/v1",
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      policy: {
        schemaVersion: "default-access-domain-policies.policy/v1",
        id: "dap_server",
        scope: { kind: "deployment-target", serverId: "srv_demo" },
        mode: "disabled",
        updatedAt: "2026-01-01T00:00:11.000Z",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowDefaultAccessDomainPolicyQuery);
    expect(capturedQuery).toMatchObject({
      scopeKind: "deployment-target",
      serverId: "srv_demo",
    });
  });
});
