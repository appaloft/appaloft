import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListProjectSummariesQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

const logger: AppLogger = { debug() {}, info() {}, warn() {}, error() {} };
const executionContextFactory: ExecutionContextFactory = {
  create(input) {
    return createExecutionContext({ ...input, requestId: input.requestId ?? "req_dashboard" });
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

describe("Dashboard Project summaries HTTP route", () => {
  test("[DASH-DATA-001][DASH-DATA-005] dispatches one bounded query", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({ items: [], nextCursor: "offset:24" } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory,
      logger,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/projects/summaries?limit=24&search=atlas&sort=recent-activity-desc",
        { headers: { cookie: "better-auth.session_token=dashboard-test" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: "offset:24" });
    expect(capturedQuery).toBeInstanceOf(ListProjectSummariesQuery);
    expect(capturedQuery).toMatchObject({ limit: 24, search: "atlas" });
  });
});
