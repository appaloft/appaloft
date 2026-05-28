import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "@appaloft/core";

import {
  type AuthBootstrapStatus,
  type AuthBootstrapStatusReader,
  BootstrapFirstAdminCommand,
  BootstrapFirstAdminCommandHandler,
  BootstrapFirstAdminUseCase,
  createExecutionContext,
  type ExecutionContext,
  type FirstAdminBootstrapper,
  type FirstAdminBootstrapRecord,
  type FirstAdminBootstrapRequest,
  type FirstAdminPasswordIssuer,
  GetAuthBootstrapStatusQuery,
  GetAuthBootstrapStatusQueryHandler,
  GetAuthBootstrapStatusQueryService,
  operationCatalog,
  type RepositoryContext,
} from "../src";

const loginMethods = [
  {
    key: "local-password" as const,
    configured: true,
    enabled: true,
  },
  {
    key: "github" as const,
    configured: false,
    enabled: false,
    reason: "not-configured",
  },
];

function requiredStatus(input?: Partial<AuthBootstrapStatus>): AuthBootstrapStatus {
  return {
    bootstrapRequired: true,
    firstAdminConfigured: false,
    organizationConfigured: false,
    loginMethods,
    loginUrl: "http://localhost:3721/login",
    nextSteps: ["create-first-admin"],
    ...input,
  };
}

function completeStatus(input?: Partial<AuthBootstrapStatus>): AuthBootstrapStatus {
  return {
    bootstrapRequired: false,
    firstAdminConfigured: true,
    organizationConfigured: true,
    firstAdminEmail: "admin@example.com",
    organizationId: "org_self_hosted",
    organizationSlug: "self-hosted-appaloft",
    loginMethods,
    loginUrl: "http://localhost:3721/login",
    nextSteps: ["sign-in"],
    ...input,
  };
}

class FixedStatusReader implements AuthBootstrapStatusReader {
  readonly contexts: RepositoryContext[] = [];

  constructor(private readonly status: AuthBootstrapStatus) {}

  async getStatus(context: RepositoryContext): Promise<Result<AuthBootstrapStatus>> {
    this.contexts.push(context);
    return ok(this.status);
  }
}

class CapturingFirstAdminBootstrapper implements FirstAdminBootstrapper {
  requests: FirstAdminBootstrapRequest[] = [];

  async bootstrapFirstAdmin(
    _context: ExecutionContext,
    request: FirstAdminBootstrapRequest,
  ): Promise<Result<FirstAdminBootstrapRecord>> {
    this.requests.push(request);
    return ok({
      email: request.email,
      organizationId: "org_self_hosted",
      organizationSlug: request.organizationSlug ?? "self-hosted-appaloft",
      userId: "usr_admin",
    });
  }
}

class FixedPasswordIssuer implements FirstAdminPasswordIssuer {
  calls = 0;

  async issue(_context: ExecutionContext) {
    this.calls += 1;
    return ok({ password: "generated-admin-password" });
  }
}

function createUseCase(input?: {
  status?: AuthBootstrapStatus;
  bootstrapper?: CapturingFirstAdminBootstrapper;
  passwordIssuer?: FixedPasswordIssuer;
}) {
  const statusReader = new FixedStatusReader(input?.status ?? requiredStatus());
  const bootstrapper = input?.bootstrapper ?? new CapturingFirstAdminBootstrapper();
  const passwordIssuer = input?.passwordIssuer ?? new FixedPasswordIssuer();
  return {
    bootstrapper,
    passwordIssuer,
    statusReader,
    useCase: new BootstrapFirstAdminUseCase(statusReader, bootstrapper, passwordIssuer),
  };
}

describe("first-admin bootstrap application boundary", () => {
  test("[FIRST-ADMIN-BOOTSTRAP-001] supplied password creates first admin without echoing the password", async () => {
    const { bootstrapper, passwordIssuer, useCase } = createUseCase();
    const context = createExecutionContext({ entrypoint: "system" });

    const result = await useCase.execute(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      password: "supplied-secret",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      bootstrapRequired: false,
      created: true,
      email: "admin@example.com",
      loginMethods,
      loginUrl: "http://localhost:3721/login",
      organizationId: "org_self_hosted",
      organizationSlug: "self-hosted-appaloft",
      userId: "usr_admin",
    });
    expect(bootstrapper.requests).toHaveLength(1);
    expect(bootstrapper.requests[0]).toMatchObject({
      password: "supplied-secret",
      email: "admin@example.com",
      organizationId: "org_self_hosted",
    });
    expect(passwordIssuer.calls).toBe(0);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("supplied-secret");
  });

  test("[FIRST-ADMIN-BOOTSTRAP-002] missing password returns generated password once", async () => {
    const { bootstrapper, passwordIssuer, useCase } = createUseCase();
    const context = createExecutionContext({ entrypoint: "system" });

    const result = await useCase.execute(context, {
      email: "admin@example.com",
      displayName: "Admin User",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      created: true,
      generatedPassword: "generated-admin-password",
      organizationId: "org_self_hosted",
      userId: "usr_admin",
    });
    expect(bootstrapper.requests[0]?.password).toBe("generated-admin-password");
    expect(passwordIssuer.calls).toBe(1);
  });

  test("[FIRST-ADMIN-BOOTSTRAP-003] bootstrap is blocked after an admin already exists", async () => {
    const { bootstrapper, passwordIssuer, useCase } = createUseCase({
      status: completeStatus(),
    });
    const context = createExecutionContext({ entrypoint: "system" });

    const result = await useCase.execute(context, {
      email: "admin@example.com",
      displayName: "Admin User",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "first_admin_bootstrap_disabled",
      details: {
        organizationId: "org_self_hosted",
        phase: "first-admin-bootstrap",
      },
    });
    expect(bootstrapper.requests).toHaveLength(0);
    expect(passwordIssuer.calls).toBe(0);
  });

  test("[FIRST-ADMIN-STATUS-001] status query returns safe bootstrap state", async () => {
    const statusReader = new FixedStatusReader(requiredStatus());
    const service = new GetAuthBootstrapStatusQueryService(statusReader);
    const handler = new GetAuthBootstrapStatusQueryHandler(service);
    const query = GetAuthBootstrapStatusQuery.create({})._unsafeUnwrap();

    const result = await handler.handle(createExecutionContext({ entrypoint: "http" }), query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(requiredStatus());
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("generated-admin-password");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("supplied-secret");
  });

  test("command and catalog expose first-admin bootstrap messages and public bootstrap transports", async () => {
    const command = BootstrapFirstAdminCommand.create({
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
    })._unsafeUnwrap();
    const { useCase } = createUseCase();
    const handler = new BootstrapFirstAdminCommandHandler(useCase);

    const result = await handler.handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isOk()).toBe(true);
    expect(operationCatalog.find((entry) => entry.key === "auth.bootstrap-status")).toMatchObject({
      transports: {
        cli: "appaloft auth bootstrap-status",
        orpc: { method: "GET", path: "/api/bootstrap/auth/status" },
      },
    });
    expect(
      operationCatalog.find((entry) => entry.key === "auth.bootstrap-first-admin"),
    ).toMatchObject({
      transports: {
        cli: "appaloft auth bootstrap-first-admin",
        orpc: { method: "POST", path: "/api/bootstrap/auth/first-admin" },
      },
    });
  });

  test("adapter failures stay behind the Appaloft-owned port", async () => {
    const statusReader = new FixedStatusReader(requiredStatus());
    const bootstrapper: FirstAdminBootstrapper = {
      async bootstrapFirstAdmin() {
        return err({
          code: "first_admin_bootstrap_failed",
          category: "infra",
          message: "Auth provider failed",
          retryable: true,
          details: { phase: "first-admin-bootstrap" },
        });
      },
    };
    const useCase = new BootstrapFirstAdminUseCase(
      statusReader,
      bootstrapper,
      new FixedPasswordIssuer(),
    );

    const result = await useCase.execute(createExecutionContext({ entrypoint: "system" }), {
      email: "admin@example.com",
      displayName: "Admin User",
      password: "supplied-secret",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "first_admin_bootstrap_failed",
    });
  });
});
