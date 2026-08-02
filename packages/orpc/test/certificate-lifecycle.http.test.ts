import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureDomainBindingCertificatePolicyCommand,
  createExecutionContext,
  DeleteCertificateCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
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
      principal: input.principal,
    });
  }
}

const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: { kind: "user", id: "usr_certificate", label: "certificate@example.test" },
      email: "certificate@example.test",
      organizationId: input.organizationId ?? "org_certificate",
      role: input.requiredRole,
      userId: "usr_certificate",
    }),
};

function certificateRequest(url: string, init: RequestInit): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", "better-auth.session_token=certificate-lifecycle-test");
  return new Request(url, { ...init, headers });
}

function createApp() {
  let capturedCommand: Command<unknown> | undefined;
  let capturedQuery: Query<unknown> | undefined;
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      capturedCommand = command as Command<unknown>;
      if (command instanceof ConfigureDomainBindingCertificatePolicyCommand) {
        return ok({
          id: "dmb_demo",
          certificatePolicy: "manual",
          reconciliationStatus: "pending",
        } as T);
      }
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
    productSessionAuthorizationPort,
    queryBus,
  });

  return {
    app,
    capturedCommand: () => capturedCommand,
    capturedQuery: () => capturedQuery,
  };
}

describe("certificate lifecycle HTTP routes", () => {
  test("[ROUTE-TLS-ENTRY-030] dispatches domain binding certificate policy through CommandBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      certificateRequest("http://localhost/api/domain-bindings/dmb_demo/certificate-policy", {
        method: "POST",
        body: JSON.stringify({
          domainBindingId: "dmb_demo",
          certificatePolicy: "manual",
          idempotencyKey: "policy-key",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "dmb_demo",
      certificatePolicy: "manual",
      reconciliationStatus: "pending",
    });
    expect(harness.capturedCommand()).toBeInstanceOf(
      ConfigureDomainBindingCertificatePolicyCommand,
    );
    expect(harness.capturedCommand()).toMatchObject({
      domainBindingId: "dmb_demo",
      certificatePolicy: "manual",
      idempotencyKey: "policy-key",
    });
  });

  test("[ROUTE-TLS-ENTRY-026] dispatches certificate show through QueryBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      certificateRequest("http://localhost/api/certificates/crt_demo", {
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
      certificateRequest("http://localhost/api/certificates/crt_demo/retries", {
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

  test("[OP-INPUT-HTTP-003] rejects unsupported certificate retry fields before dispatch", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      certificateRequest("http://localhost/api/certificates/crt_demo/retries", {
        method: "POST",
        body: JSON.stringify({
          certificateId: "crt_demo",
          idempotencyKey: "retry-key",
          providerKey: "unsupported-provider",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "command-validation",
          validationIssueCodes: ["unsupported_field"],
          validationIssuePaths: ["providerKey"],
        },
      },
    });
    expect(harness.capturedCommand()).toBeUndefined();
  });

  test("[ROUTE-TLS-ENTRY-028] dispatches certificate revoke through CommandBus", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      certificateRequest("http://localhost/api/certificates/crt_demo/revoke", {
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
      certificateRequest("http://localhost/api/certificates/crt_demo", {
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

  test("[OP-INPUT-HTTP-003] rejects unsupported nested certificate delete fields before dispatch", async () => {
    const harness = createApp();

    const response = await harness.app.handle(
      certificateRequest("http://localhost/api/certificates/crt_demo", {
        method: "DELETE",
        body: JSON.stringify({
          certificateId: "crt_demo",
          confirmation: { certificateId: "crt_demo", force: true },
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "command-validation",
          validationIssueCodes: ["unsupported_field"],
          validationIssuePaths: ["confirmation.force"],
        },
      },
    });
    expect(harness.capturedCommand()).toBeUndefined();
  });
});
