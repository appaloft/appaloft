import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  ShowResourceQuery,
} from "@appaloft/application";
import { type ResourceDetail } from "@appaloft/contracts";
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
      requestId: input.requestId ?? "req_orpc_resource_show_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function resourceDetail(): ResourceDetail {
  return {
    schemaVersion: "resources.show/v1",
    resource: {
      id: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      destinationId: "dst_demo",
      name: "Web",
      slug: "web",
      kind: "application",
      createdAt: "2026-01-01T00:00:00.000Z",
      services: [],
      deploymentCount: 0,
    },
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
    lifecycle: {
      status: "active",
    },
    diagnostics: [],
    generatedAt: "2026-01-01T00:00:10.000Z",
  };
}

describe("resource show HTTP route", () => {
  test("[RES-PROFILE-SHOW-001] dispatches ShowResourceQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok(resourceDetail() as T);
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
        "http://localhost/api/resources/res_web?includeLatestDeployment=true&includeAccessSummary=true&includeProfileDiagnostics=true",
        {
          method: "GET",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "resources.show/v1",
      resource: {
        id: "res_web",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowResourceQuery);
    expect(capturedQuery).toMatchObject({
      resourceId: "res_web",
      includeLatestDeployment: true,
      includeAccessSummary: true,
      includeProfileDiagnostics: true,
    });
  });
});
