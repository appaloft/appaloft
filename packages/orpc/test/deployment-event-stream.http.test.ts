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
  type Query,
  type QueryBus,
  StreamDeploymentEventsQuery,
} from "@appaloft/application";
import { type DeploymentEventStreamResponse } from "@appaloft/contracts";
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
      requestId: input.requestId ?? "req_orpc_deployment_event_stream_test",
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
        id: "usr_deployment_events",
        label: "deployment-events@example.test",
      },
      email: "deployment-events@example.test",
      organizationId: input.organizationId ?? "org_deployment_events_test",
      role: input.requiredRole,
      userId: "usr_deployment_events",
    }),
};

function deploymentEventStreamRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set(
    "cookie",
    headers.get("cookie") ?? "better-auth.session_token=deployment-events-test",
  );

  return new Request(url, {
    ...init,
    headers,
  });
}

function deploymentEventReplay(): DeploymentEventStreamResponse {
  return {
    deploymentId: "dep_demo",
    envelopes: [
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          emittedAt: "2026-01-01T00:00:01.000Z",
          source: "progress-projection",
          eventType: "deployment-requested",
          phase: "detect",
          summary: "Deployment requested",
        },
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "dep_demo:1",
      },
    ],
  };
}

describe("deployment event replay HTTP route", () => {
  test("[DEP-EVENTS-ENTRY-004] dispatches StreamDeploymentEventsQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          mode: "bounded",
          deploymentId: "dep_demo",
          envelopes: deploymentEventReplay().envelopes,
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
      deploymentEventStreamRequest(
        "http://localhost/api/deployments/dep_demo/events?historyLimit=25&includeHistory=true",
        {
          method: "GET",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(deploymentEventReplay());
    expect(capturedQuery).toBeInstanceOf(StreamDeploymentEventsQuery);
    expect(capturedQuery).toMatchObject({
      deploymentId: "dep_demo",
      historyLimit: 25,
      includeHistory: true,
      follow: false,
      untilTerminal: true,
    });
  });
});
