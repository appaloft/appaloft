import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureResourceRolloutCommand,
  ConfigureResourceScaleCommand,
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
      requestId: input.requestId ?? "req_orpc_resource_scale_rollout_test",
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
      actor: { kind: "user", id: "usr_scale_rollout", label: "scale@example.test" },
      email: "scale@example.test",
      organizationId: input.organizationId ?? "org_scale_rollout",
      role: input.requiredRole,
      userId: "usr_scale_rollout",
    }),
};

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost/api/resources/res_web/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "better-auth.session_token=resource-scale-rollout-test",
    },
    body: JSON.stringify(body),
  });
}

describe("resource scale and rollout profile HTTP routes", () => {
  test("[K8S-SURFACE-017] dispatches the shared scale and rollout commands", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        commands.push(command as Command<unknown>);
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

    const scaleResponse = await app.handle(
      request("scale-profile", {
        resourceId: "res_web",
        scaleProfile: {
          replicas: 3,
          cpuRequestMillicores: 250,
          horizontal: {
            minReplicas: 2,
            maxReplicas: 8,
            targetCpuUtilizationPercent: 70,
          },
        },
      }),
    );
    const rolloutResponse = await app.handle(
      request("rollout-profile", {
        resourceId: "res_web",
        rolloutProfile: {
          strategy: "rolling",
          maxUnavailable: 1,
          maxSurge: 2,
        },
      }),
    );

    expect(scaleResponse.status).toBe(200);
    expect(await scaleResponse.json()).toEqual({ id: "res_web" });
    expect(rolloutResponse.status).toBe(200);
    expect(await rolloutResponse.json()).toEqual({ id: "res_web" });
    expect(commands[0]).toBeInstanceOf(ConfigureResourceScaleCommand);
    expect(commands[1]).toBeInstanceOf(ConfigureResourceRolloutCommand);
  });

  test("[K8S-SURFACE-017] rejects incomplete horizontal policy before dispatch", async () => {
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
      request("scale-profile", {
        resourceId: "res_web",
        scaleProfile: {
          replicas: 3,
          horizontal: { minReplicas: 2 },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(dispatchCount).toBe(0);
  });
});
