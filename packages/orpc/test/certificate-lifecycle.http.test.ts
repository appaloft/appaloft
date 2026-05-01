import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeleteCertificateCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  RetryCertificateCommand,
  RevokeCertificateCommand,
  ShowCertificateQuery,
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
      requestId: input.requestId ?? "req_orpc_certificate_lifecycle_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function createApp() {
  let capturedCommand: Command<unknown> | undefined;
  let capturedQuery: Query<unknown> | undefined;
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      capturedCommand = command as Command<unknown>;
      return ok({ certificateId: "crt_demo", attemptId: "cat_retry" } as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      capturedQuery = query as Query<unknown>;
      return ok({
        id: "crt_demo",
        domainBindingId: "dmb_demo",
        domainName: "secure.example.com",
        status: "active",
        source: "managed",
        providerKey: "acme",
        challengeType: "http-01",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as QueryBus;

  const app = mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });

  return {
    app,
    capturedCommand: () => capturedCommand,
    capturedQuery: () => capturedQuery,
  };
}

describe("certificate lifecycle HTTP routes", () => {
  test("[ROUTE-TLS-ENTRY-026] dispatches certificate show through QueryBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      new Request("http://localhost/api/certificates/crt_demo", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "crt_demo",
      status: "active",
    });
    expect(harness.capturedQuery()).toBeInstanceOf(ShowCertificateQuery);
    expect(harness.capturedQuery()).toMatchObject({ certificateId: "crt_demo" });
  });

  test("[ROUTE-TLS-ENTRY-027] dispatches certificate retry through CommandBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      new Request("http://localhost/api/certificates/crt_demo/retries", {
        method: "POST",
        body: JSON.stringify({ certificateId: "crt_demo", idempotencyKey: "retry-key" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ attemptId: "cat_retry" });
    expect(harness.capturedCommand()).toBeInstanceOf(RetryCertificateCommand);
    expect(harness.capturedCommand()).toMatchObject({
      certificateId: "crt_demo",
      idempotencyKey: "retry-key",
    });
  });

  test("[ROUTE-TLS-ENTRY-028] dispatches certificate revoke through CommandBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      new Request("http://localhost/api/certificates/crt_demo/revoke", {
        method: "POST",
        body: JSON.stringify({ certificateId: "crt_demo", reason: "operator-requested" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ certificateId: "crt_demo" });
    expect(harness.capturedCommand()).toBeInstanceOf(RevokeCertificateCommand);
    expect(harness.capturedCommand()).toMatchObject({
      certificateId: "crt_demo",
      reason: "operator-requested",
    });
  });

  test("[ROUTE-TLS-ENTRY-029] dispatches certificate delete through CommandBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      new Request("http://localhost/api/certificates/crt_demo", {
        method: "DELETE",
        body: JSON.stringify({
          certificateId: "crt_demo",
          confirmation: { certificateId: "crt_demo" },
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ certificateId: "crt_demo" });
    expect(harness.capturedCommand()).toBeInstanceOf(DeleteCertificateCommand);
    expect(harness.capturedCommand()).toMatchObject({
      certificateId: "crt_demo",
      confirmation: { certificateId: "crt_demo" },
    });
  });
});
