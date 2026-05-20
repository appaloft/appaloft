import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  EvaluateDeploymentOverlayCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListDeploymentOverlayDecisionsQuery,
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
      requestId: input.requestId ?? "req_orpc_deployment_overlay_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("deployment overlay HTTP routes", () => {
  test("[CLOUD-MDEP-QUERY-008] evaluates neutral deployment overlay through oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          result: {
            operationKey: "deployments.create",
            decision: "skipped",
            allowed: true,
            reason: "deployment-overlay-default-noop",
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
      new Request("http://localhost/api/deployment-overlays", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operationKey: "deployments.create",
          capabilityKey: "managed-deployments.use",
          organizationId: "org_demo",
          resourceRefs: {
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_demo",
            serverId: "srv_demo",
          },
          source: "api-harness",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      result: {
        operationKey: "deployments.create",
        decision: "skipped",
        allowed: true,
        reason: "deployment-overlay-default-noop",
        source: "default",
      },
    });
    expect(capturedCommand).toBeInstanceOf(EvaluateDeploymentOverlayCommand);
    expect(capturedCommand).toMatchObject({
      input: {
        operationKey: "deployments.create",
        capabilityKey: "managed-deployments.use",
        organizationId: "org_demo",
        source: "api-harness",
      },
    });
  });

  test("[CLOUD-MDEP-QUERY-008] lists neutral deployment overlay decisions through oRPC", async () => {
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
              schemaVersion: "deployment-overlay.decision/v1",
              id: "deployment_overlay_http_1",
              operationKey: "deployments.create",
              decision: "enabled",
              reason: "test",
              source: "test",
              tenantId: "tenant_demo",
              decidedAt: "2026-05-20T00:00:01.000Z",
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
      new Request("http://localhost/api/deployment-overlays?tenantId=tenant_demo", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      records: [
        {
          schemaVersion: "deployment-overlay.decision/v1",
          id: "deployment_overlay_http_1",
          operationKey: "deployments.create",
          decision: "enabled",
          reason: "test",
          source: "test",
          tenantId: "tenant_demo",
          decidedAt: "2026-05-20T00:00:01.000Z",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListDeploymentOverlayDecisionsQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        tenantId: "tenant_demo",
      },
    });
  });
});
