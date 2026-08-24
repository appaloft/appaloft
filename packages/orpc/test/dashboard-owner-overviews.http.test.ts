import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
  ProjectEnvironmentOverviewQuery,
  type Query,
  type QueryBus,
  ResourceOverviewQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

const logger: AppLogger = { debug() {}, info() {}, warn() {}, error() {} };
const executionContextFactory: ExecutionContextFactory = {
  create(input) {
    return createExecutionContext({
      ...input,
      requestId: input.requestId ?? "req_dashboard_owner",
    });
  },
};
const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: { kind: "user", id: "usr_dashboard", label: "dashboard@example.test" },
      email: "dashboard@example.test",
      organizationId: "org_dashboard",
      role: input.requiredRole,
      userId: "usr_dashboard",
    }),
};

function createApp(onQuery: (query: Query<unknown>) => unknown) {
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
      ok({} as T),
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> =>
      ok(onQuery(query as Query<unknown>) as T),
  } as QueryBus;
  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory,
    logger,
    productSessionAuthorizationPort,
    queryBus,
  });
}

describe("Dashboard owner overview HTTP routes", () => {
  test("[DASH-DATA-002][DASH-DATA-005] dispatches the bounded Project Environment query", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = createApp((query) => {
      capturedQuery = query;
      return {
        schemaVersion: "project-environments.overview/v1",
        project: { id: "prj_atlas", name: "Atlas", slug: "atlas" },
        environment: {
          id: "env_prod",
          name: "Production",
          kind: "production",
          lifecycleStatus: "active",
        },
        environmentChoices: [],
        resources: [],
        attention: { total: 0, healthy: 0, attention: 0, unknown: 0 },
        generatedAt: "2026-08-24T08:00:00.000Z",
      };
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/projects/prj_atlas/environments/env_prod/overview?limit=24&sort=name-asc",
        { headers: { cookie: "better-auth.session_token=dashboard-test" } },
      ),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).schemaVersion).toBe("project-environments.overview/v1");
    expect(capturedQuery).toBeInstanceOf(ProjectEnvironmentOverviewQuery);
    expect(capturedQuery).toMatchObject({
      projectId: "prj_atlas",
      environmentId: "env_prod",
      limit: 24,
    });
  });

  test("[DASH-DATA-003][DASH-DATA-006] dispatches the owner-consistent Resource query", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = createApp((query) => {
      capturedQuery = query;
      return {
        schemaVersion: "resources.overview/v1",
        resource: {
          id: "res_api",
          projectId: "prj_atlas",
          environmentId: "env_prod",
          name: "api",
          slug: "api",
          kind: "application",
          lifecycleStatus: "active",
        },
        health: { status: "unknown" },
        access: { status: "unknown" },
        configuration: {
          sourceConfigured: false,
          runtimeConfigured: false,
          networkConfigured: false,
          accessConfigured: false,
          status: "incomplete",
        },
        network: {},
        capabilities: {
          deploy: true,
          configure: true,
          logs: true,
          metrics: true,
          networking: true,
        },
        latestDeployments: [],
        generatedAt: "2026-08-24T08:00:00.000Z",
      };
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/projects/prj_atlas/environments/env_prod/resources/res_api/overview",
        { headers: { cookie: "better-auth.session_token=dashboard-test" } },
      ),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).schemaVersion).toBe("resources.overview/v1");
    expect(capturedQuery).toBeInstanceOf(ResourceOverviewQuery);
    expect(capturedQuery).toMatchObject({
      projectId: "prj_atlas",
      environmentId: "env_prod",
      resourceId: "res_api",
    });
  });
});
