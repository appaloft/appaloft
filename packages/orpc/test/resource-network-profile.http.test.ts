import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureResourceNetworkCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
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
      requestId: input.requestId ?? "req_orpc_resource_network_profile_test",
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
      actor: { kind: "user", id: "usr_network_profile", label: "network@example.test" },
      email: "network@example.test",
      organizationId: input.organizationId ?? "org_network_profile",
      role: input.requiredRole,
      userId: "usr_network_profile",
    }),
};

function resourceNetworkRequest(body: unknown): Request {
  return new Request("http://localhost/api/resources/res_web/network-profile", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "better-auth.session_token=resource-network-profile-test",
    },
    body: JSON.stringify(body),
  });
}

describe("resource network profile HTTP route", () => {
  test("[RES-PROFILE-ENTRY-004] dispatches ConfigureResourceNetworkCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "res_web" } as T);
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
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      resourceNetworkRequest({
        resourceId: "res_web",
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "res_web" });
    expect(capturedCommand).toBeInstanceOf(ConfigureResourceNetworkCommand);
  });

  test("[OP-INPUT-HTTP-003] rejects unsupported fields before HTTP command dispatch", async () => {
    let dispatchCount = 0;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> => {
        dispatchCount += 1;
        return ok({ id: "res_web" } as T);
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
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      resourceNetworkRequest({
        resourceId: "res_web",
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
          routingMode: "custom",
        },
        domains: ["app.example.com"],
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "validation_error",
        category: "user",
        message: "Input validation failed",
        retryable: false,
        details: {
          phase: "command-validation",
          validationIssueCodes: ["unsupported_field", "unsupported_field"],
          validationIssuePaths: ["networkProfile.routingMode", "domains"],
          validationIssueMessages: [
            "Unsupported field: networkProfile.routingMode",
            "Unsupported field: domains",
          ],
        },
      },
    });
    expect(dispatchCount).toBe(0);
  });
});
