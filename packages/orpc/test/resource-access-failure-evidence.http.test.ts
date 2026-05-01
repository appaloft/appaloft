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
  ResourceAccessFailureEvidenceLookupQuery,
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
      requestId: input.requestId ?? "req_orpc_access_failure_evidence_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("resource access failure evidence HTTP route", () => {
  test("[RES-ACCESS-DIAG-EVIDENCE-001] dispatches lookup query through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok(null as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "resources.access-failure-evidence.lookup/v1",
          requestId: "req_access_timeout",
          status: "not-found",
          generatedAt: "2026-01-01T00:00:10.000Z",
          filters: {
            resourceId: "res_web",
            hostname: "web.example.test",
            path: "/private",
          },
          nextAction: "diagnostic-summary",
          notFound: {
            code: "resource_access_failure_evidence_not_found",
            phase: "evidence-lookup",
            message: "No retained access failure evidence matched the request id.",
          },
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
      new Request(
        "http://localhost/api/resource-access-failures/req_access_timeout?resourceId=res_web&hostname=web.example.test&path=/private",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      requestId: "req_access_timeout",
      status: "not-found",
    });
    expect(capturedQuery).toBeInstanceOf(ResourceAccessFailureEvidenceLookupQuery);
    expect(capturedQuery).toMatchObject({
      requestId: "req_access_timeout",
      resourceId: "res_web",
      hostname: "web.example.test",
      path: "/private",
    });
  });
});
