import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  EvaluateRouteSurfaceCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListRouteSurfaceDecisionsQuery,
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
      requestId: input.requestId ?? "req_orpc_route_surface_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("route surface HTTP routes", () => {
  test("[CLOUD-SURFACE-QUERY-008] evaluates neutral route surface through oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          result: {
            operationKey: "route-surfaces.prepare",
            decision: "skipped",
            allowed: true,
            reason: "route-surface-default-noop",
            source: "default",
            surfaceKind: "static-artifact",
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
      new Request("http://localhost/api/route-surfaces", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operationKey: "route-surfaces.prepare",
          capabilityKey: "cloud.static-artifacts.publish",
          organizationId: "org_demo",
          surfaceKind: "static-artifact",
          resourceRefs: {
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_demo",
            deploymentId: "dep_demo",
            staticArtifactId: "sta_demo",
          },
          source: "api-harness",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      result: {
        operationKey: "route-surfaces.prepare",
        decision: "skipped",
        allowed: true,
        reason: "route-surface-default-noop",
        source: "default",
        surfaceKind: "static-artifact",
      },
    });
    expect(capturedCommand).toBeInstanceOf(EvaluateRouteSurfaceCommand);
    expect(capturedCommand).toMatchObject({
      input: {
        operationKey: "route-surfaces.prepare",
        capabilityKey: "cloud.static-artifacts.publish",
        organizationId: "org_demo",
        source: "api-harness",
        surfaceKind: "static-artifact",
      },
    });
  });

  test("[CLOUD-SURFACE-QUERY-008] lists neutral route surface decisions through oRPC", async () => {
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
              schemaVersion: "route-surface.decision/v1",
              id: "route_surface_http_1",
              operationKey: "route-surfaces.prepare",
              decision: "enabled",
              reason: "test",
              source: "test",
              surfaceKind: "routing",
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
      new Request("http://localhost/api/route-surfaces?tenantId=tenant_demo&surfaceKind=routing", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      records: [
        {
          schemaVersion: "route-surface.decision/v1",
          id: "route_surface_http_1",
          operationKey: "route-surfaces.prepare",
          decision: "enabled",
          reason: "test",
          source: "test",
          surfaceKind: "routing",
          tenantId: "tenant_demo",
          decidedAt: "2026-05-20T00:00:01.000Z",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListRouteSurfaceDecisionsQuery);
    expect(capturedQuery).toMatchObject({
      input: {
        tenantId: "tenant_demo",
        surfaceKind: "routing",
      },
    });
  });
});
