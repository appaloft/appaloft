import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeploymentTimelineQuery,
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
      requestId: input.requestId ?? "req_orpc_deployment_timeline_test",
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
        id: "usr_deployment_timeline",
        label: "deployment-timeline@example.test",
      },
      email: "deployment-timeline@example.test",
      organizationId: input.organizationId ?? "org_deployment_timeline_test",
      role: input.requiredRole,
      userId: "usr_deployment_timeline",
    }),
};

function deploymentTimelineRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set(
    "cookie",
    headers.get("cookie") ?? "better-auth.session_token=deployment-timeline-test",
  );

  return new Request(url, {
    ...init,
    headers,
  });
}

describe("deployment timeline HTTP route", () => {
  test("[DEP-TIMELINE-006] dispatches DeploymentTimelineQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "deployments.timeline/v1",
          deploymentId: "dep_demo",
          entries: [
            {
              deploymentId: "dep_demo",
              sequence: 1,
              cursor: "dep_demo:1",
              occurredAt: "2026-01-01T00:00:01.000Z",
              source: "appaloft",
              kind: "lifecycle",
              level: "info",
              message: "Deployment requested",
            },
          ],
          nextCursor: "dep_demo:1",
          hasMore: false,
        } as T);
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
      deploymentTimelineRequest(
        "http://localhost/api/deployments/dep_demo/timeline?limit=25&kinds=output,diagnostic",
        {
          method: "GET",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: "dep_demo",
      entries: [expect.objectContaining({ cursor: "dep_demo:1" })],
      hasMore: false,
    });
    expect(capturedQuery).toBeInstanceOf(DeploymentTimelineQuery);
    expect(capturedQuery).toMatchObject({
      deploymentId: "dep_demo",
      limit: 25,
      kinds: ["output", "diagnostic"],
    });
  });
});
