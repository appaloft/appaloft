import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListDeploymentsQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  ShowDeploymentQuery,
} from "@appaloft/application";
import { type ShowDeploymentResponse } from "@appaloft/contracts";
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
      requestId: input.requestId ?? "req_orpc_deployment_show_test",
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
        id: "usr_deployment_show",
        label: "deployment-show@example.test",
      },
      email: "deployment-show@example.test",
      organizationId: input.organizationId ?? "org_deployment_show_test",
      role: input.requiredRole,
      userId: "usr_deployment_show",
    }),
};

function deploymentShowRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", headers.get("cookie") ?? "better-auth.session_token=deployment-show-test");

  return new Request(url, {
    ...init,
    headers,
  });
}

function deploymentDetail(): ShowDeploymentResponse {
  return {
    schemaVersion: "deployments.show/v1",
    deployment: {
      id: "dep_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      target: {
        kind: "server-backed",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
      status: "failed",
      runtimePlan: {
        id: "rplan_demo",
        source: {
          kind: "git-public",
          locator: "https://github.com/acme/web.git",
          displayName: "acme/web",
        },
        buildStrategy: "workspace-commands",
        packagingMode: "host-process-runtime",
        execution: {
          kind: "host-process",
          port: 3000,
        },
        target: {
          kind: "single-server",
          providerKey: "local-shell",
          serverIds: ["srv_demo"],
        },
        detectSummary: "detected workspace",
        generatedAt: "2026-01-01T00:00:00.000Z",
        steps: ["detect", "plan", "deploy", "verify"],
      },
      environmentSnapshot: {
        id: "snap_demo",
        environmentId: "env_demo",
        createdAt: "2026-01-01T00:00:00.000Z",
        precedence: ["defaults", "environment", "deployment"],
        variables: [],
      },
      createdAt: "2026-01-01T00:00:05.000Z",
      startedAt: "2026-01-01T00:00:06.000Z",
      finishedAt: "2026-01-01T00:00:09.000Z",
      timelineCount: 3,
    },
    status: {
      current: "failed",
      createdAt: "2026-01-01T00:00:05.000Z",
      startedAt: "2026-01-01T00:00:06.000Z",
      finishedAt: "2026-01-01T00:00:09.000Z",
    },
    relatedContext: {
      project: {
        id: "prj_demo",
        name: "Demo",
        slug: "demo",
      },
      environment: {
        id: "env_demo",
        name: "Production",
        kind: "production",
      },
      resource: {
        id: "res_web",
        name: "Web",
        slug: "web",
        kind: "application",
      },
      server: {
        id: "srv_demo",
        name: "Primary",
        host: "203.0.113.10",
        port: 22,
        providerKey: "local-shell",
      },
      destination: {
        id: "dst_demo",
      },
    },
    snapshot: {
      runtimePlan: {
        id: "rplan_demo",
        source: {
          kind: "git-public",
          locator: "https://github.com/acme/web.git",
          displayName: "acme/web",
        },
        buildStrategy: "workspace-commands",
        packagingMode: "host-process-runtime",
        execution: {
          kind: "host-process",
          port: 3000,
        },
        target: {
          kind: "single-server",
          providerKey: "local-shell",
          serverIds: ["srv_demo"],
        },
        detectSummary: "detected workspace",
        generatedAt: "2026-01-01T00:00:00.000Z",
        steps: ["detect", "plan", "deploy", "verify"],
      },
      environmentSnapshot: {
        id: "snap_demo",
        environmentId: "env_demo",
        createdAt: "2026-01-01T00:00:00.000Z",
        precedence: ["defaults", "environment", "deployment"],
        variables: [],
      },
    },
    timeline: {
      createdAt: "2026-01-01T00:00:05.000Z",
      startedAt: "2026-01-01T00:00:06.000Z",
      finishedAt: "2026-01-01T00:00:09.000Z",
      timelineCount: 3,
    },
    latestFailure: {
      timestamp: "2026-01-01T00:00:09.000Z",
      source: "appaloft",
      phase: "verify",
      level: "error",
      message: "Health check failed",
    },
    nextActions: ["timeline", "resource-detail", "resource-health", "diagnostic-summary"],
    sectionErrors: [],
    generatedAt: "2026-01-01T00:00:10.000Z",
  };
}

describe("deployment show HTTP route", () => {
  test("[DEP-SHOW-ENTRY-004] dispatches ShowDeploymentQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok(deploymentDetail() as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      deploymentShowRequest("http://localhost/api/deployments/dep_demo", {
        method: "GET",
      }),
    );

    const body = await response.text();
    expect(response.status, body).toBe(200);
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({
      schemaVersion: "deployments.show/v1",
      deployment: {
        id: "dep_demo",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowDeploymentQuery);
    expect(capturedQuery).toMatchObject({
      deploymentId: "dep_demo",
      includeTimeline: true,
      includeSnapshot: true,
      includeRelatedContext: true,
      includeLatestFailure: true,
    });
  });

  test("[DEP-LIST-ENTRY-006] dispatches ListDeploymentsQuery through HTTP with boolean query parameters", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      deploymentShowRequest("http://localhost/api/deployments?includeArchived=false", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(capturedQuery).toBeInstanceOf(ListDeploymentsQuery);
    expect(capturedQuery).toMatchObject({
      includeArchived: false,
    });
  });
});
