import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CheckResourceDeleteSafetyQuery,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
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
      principal: input.principal,
    });
  }
}

const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: {
        kind: "user",
        id: "usr_resource_show",
        label: "resource-show@example.test",
      },
      email: "resource-show@example.test",
      organizationId: input.organizationId ?? "org_resource_show_test",
      role: input.requiredRole,
      userId: "usr_resource_show",
    }),
};

function mountResourceShowRoutes(input: { commandBus: CommandBus; queryBus: QueryBus }) {
  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus: input.commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    productSessionAuthorizationPort,
    queryBus: input.queryBus,
  });
}

function resourceShowRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", headers.get("cookie") ?? "better-auth.session_token=resource-show-test");

  return new Request(url, {
    ...init,
    headers,
  });
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
    diagnostics: [
      {
        code: "resource_profile_drift",
        severity: "info",
        message:
          "Resource profile differs from latest deployment snapshot at networkProfile.internalPort.",
        path: "networkProfile.internalPort",
        section: "network",
        fieldPath: "networkProfile.internalPort",
        comparison: "resource-vs-latest-snapshot",
        resourceValue: {
          state: "present",
          displayValue: 3000,
        },
        deploymentSnapshotValue: {
          state: "present",
          displayValue: 4310,
        },
        latestDeploymentId: "dep_new",
        blocksDeploymentAdmission: false,
        suggestedCommand: "resources.configure-network",
      },
    ],
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
    const app = mountResourceShowRoutes({ commandBus, queryBus });

    const response = await app.handle(
      resourceShowRequest(
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
      diagnostics: [
        {
          code: "resource_profile_drift",
          severity: "info",
          section: "network",
          fieldPath: "networkProfile.internalPort",
          comparison: "resource-vs-latest-snapshot",
          suggestedCommand: "resources.configure-network",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ShowResourceQuery);
    expect(capturedQuery).toMatchObject({
      resourceId: "res_web",
      includeLatestDeployment: true,
      includeAccessSummary: true,
      includeProfileDiagnostics: true,
    });
  });

  test("[RES-PROFILE-ENTRY-018] dispatches CheckResourceDeleteSafetyQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "resources.delete-check/v1",
          resourceId: "res_web",
          lifecycleStatus: "archived",
          eligible: false,
          blockers: [
            {
              kind: "server-applied-route",
              relatedEntityId: "route_set_1",
              relatedEntityType: "server-applied-route",
              count: 1,
            },
          ],
          checkedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as QueryBus;
    const app = mountResourceShowRoutes({ commandBus, queryBus });

    const response = await app.handle(
      resourceShowRequest("http://localhost/api/resources/res_web/delete-check", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "resources.delete-check/v1",
      resourceId: "res_web",
      eligible: false,
      blockers: [
        {
          kind: "server-applied-route",
          relatedEntityId: "route_set_1",
          relatedEntityType: "server-applied-route",
          count: 1,
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(CheckResourceDeleteSafetyQuery);
    expect(capturedQuery).toMatchObject({ resourceId: "res_web" });
  });
});
