import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  BootstrapFirstAdminCommand,
  type Command,
  type CommandBus,
  CreateProjectCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  GetAuthBootstrapStatusQuery,
  ListCertificatesQuery,
  ListDependencyResourcesQuery,
  ListDomainBindingsQuery,
  ListEnvironmentsQuery,
  ListProjectsQuery,
  ListProvidersQuery,
  ListResourcesQuery,
  ListServersQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  SetResourceVariableCommand,
  ShowProjectQuery,
  SwitchCurrentOrganizationCommand,
} from "@appaloft/application";
import { err, ok, type Result } from "@appaloft/core";
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
      requestId: input.requestId ?? "req_orpc_product_auth_gate_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
    });
  }
}

function mountProductAuthGateRoutes(input: {
  commandBus: CommandBus;
  productSessionAuthorizationPort: ProductSessionAuthorizationPort;
  queryBus: QueryBus;
}) {
  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus: input.commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    productSessionAuthorizationPort: input.productSessionAuthorizationPort,
    queryBus: input.queryBus,
  });
}

const queryBus = {
  execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
    expect(query).toBeInstanceOf(ShowProjectQuery);
    return ok({
      id: "prj_demo",
      name: "Demo Project",
      slug: "demo-project",
      lifecycleStatus: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as T);
  },
} as QueryBus;

describe("product auth gate HTTP/oRPC routes", () => {
  test("[PRODUCT-AUTH-GATE-001] protected HTTP mutations reject missing product sessions before command dispatch", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("command bus must not dispatch without product auth");
      },
    } as unknown as CommandBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        err({
          code: "product_auth_missing",
          category: "user",
          message: "Product operation requires a valid session",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "product-authentication",
            requiredRole: input.requiredRole,
          },
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Customer API",
        }),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).toContain("product_auth_missing");
  });

  test("[PRODUCT-AUTH-GATE-002] protected HTTP mutations reject insufficient organization roles before command dispatch", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("command bus must not dispatch for insufficient product role");
      },
    } as unknown as CommandBus;
    const capturedAuthorizationRequests: Array<
      Parameters<ProductSessionAuthorizationPort["authorizeProductSession"]>[1]
    > = [];
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        capturedAuthorizationRequests.push(input);
        return err({
          code: "product_auth_forbidden",
          category: "user",
          message: "Product session is not authorized for this operation",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "product-authorization",
            requiredRole: input.requiredRole,
          },
        });
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-member-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Customer API",
        }),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(text).toContain("product_auth_forbidden");
  });

  test("[PRODUCT-AUTH-GATE-002] environment and deployment-target mutations require admin role", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("command bus must not dispatch for insufficient product role");
      },
    } as unknown as CommandBus;
    const capturedAuthorizationRequests: Array<
      Parameters<ProductSessionAuthorizationPort["authorizeProductSession"]>[1]
    > = [];
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        capturedAuthorizationRequests.push(input);
        return err({
          code: "product_auth_forbidden",
          category: "user",
          message: "Product session is not authorized for this operation",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "product-authorization",
            requiredRole: input.requiredRole,
          },
        });
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });
    const cases = [
      {
        body: {
          lockReason: "Change freeze",
        },
        path: "http://localhost/api/environments/env_demo/lock",
      },
      {
        body: {
          name: "Primary edge",
        },
        path: "http://localhost/api/servers/srv_demo/rename",
      },
    ];

    for (const testCase of cases) {
      const response = await app.handle(
        new Request(testCase.path, {
          method: "POST",
          headers: {
            cookie: "better-auth.session_token=test-member-session",
            "content-type": "application/json",
          },
          body: JSON.stringify(testCase.body),
        }),
      );
      const text = await response.text();

      expect(response.status, text).toBe(403);
      expect(text).toContain("product_auth_forbidden");
    }
    expect(capturedAuthorizationRequests.map((request) => request.requiredRole)).toEqual([
      "admin",
      "admin",
    ]);
  });

  test("[PRODUCT-AUTH-GATE-004] catalog metadata can relax command auth from admin to member", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedAuthorizationRequest:
      | Parameters<ProductSessionAuthorizationPort["authorizeProductSession"]>[1]
      | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          user: {
            userId: "usr_member",
            email: "member@example.com",
          },
          currentOrganization: {
            organizationId: "org_second",
            name: "Second Appaloft",
            slug: "second-appaloft",
            role: "developer",
          },
          organizations: [],
          loginMethods: [],
        } as T);
      },
    } as CommandBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        capturedAuthorizationRequest = input;
        return ok({
          actor: {
            kind: "user",
            id: "usr_member",
            label: "member@example.com",
          },
          email: "member@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_member",
        });
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/organizations/current-context/switch", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-member-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_second",
        }),
      }),
    );
    const text = await response.text();

    expect(response.status, text).toBe(200);
    expect(capturedAuthorizationRequest).toMatchObject({
      path: "/api/organizations/current-context/switch",
      requiredRole: "member",
    });
    expect(capturedCommand).toBeInstanceOf(SwitchCurrentOrganizationCommand);
  });

  test("authorized product HTTP mutations dispatch with the authenticated user actor", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedActor: ExecutionContext["actor"];
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedActor = context.actor;
        capturedCommand = command as Command<unknown>;
        return ok({ id: "prj_demo" } as T);
      },
    } as CommandBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: {
            kind: "user",
            id: "usr_admin",
            label: "admin@example.com",
          },
          email: "admin@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_admin",
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Customer API",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "prj_demo" });
    expect(capturedCommand).toBeInstanceOf(CreateProjectCommand);
    expect(capturedActor).toMatchObject({
      kind: "user",
      id: "usr_admin",
    });
  });

  test("[PRODUCT-AUTH-GATE-001] protected oRPC mutations reject missing product sessions before command dispatch", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("command bus must not dispatch without product auth");
      },
    } as unknown as CommandBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        err({
          code: "product_auth_missing",
          category: "user",
          message: "Product operation requires a valid session",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "product-authentication",
            requiredRole: input.requiredRole,
          },
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/rpc/resources/setVariable", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            resourceId: "res_web",
            key: "DATABASE_URL",
            value: "postgres://resource",
            kind: "secret",
            exposure: "runtime",
            isSecret: true,
          },
        }),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).toContain("product_auth_missing");
  });

  test("authorized product oRPC mutations dispatch with the authenticated user actor", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedActor: ExecutionContext["actor"];
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedActor = context.actor;
        capturedCommand = command as Command<unknown>;
        return ok(null as T);
      },
    } as CommandBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: {
            kind: "user",
            id: "usr_admin",
            label: "admin@example.com",
          },
          email: "admin@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_admin",
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/rpc/resources/setVariable", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            resourceId: "res_web",
            key: "DATABASE_URL",
            value: "postgres://resource",
            kind: "secret",
            exposure: "runtime",
            isSecret: true,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: null });
    expect(capturedCommand).toBeInstanceOf(SetResourceVariableCommand);
    expect(capturedActor).toMatchObject({
      kind: "user",
      id: "usr_admin",
    });
  });

  test("[PRODUCT-AUTH-READ-001] project HTTP queries reject missing product sessions before query dispatch", async () => {
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const protectedQueryBus = {
      execute: async () => {
        throw new Error("query bus must not dispatch without product auth");
      },
    } as unknown as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        err({
          code: "product_auth_missing",
          category: "user",
          message: "Product operation requires a valid session",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "product-authentication",
            requiredRole: input.requiredRole,
          },
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: protectedQueryBus,
    });

    const response = await app.handle(new Request("http://localhost/api/projects/prj_demo"));
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).toContain("product_auth_missing");
  });

  test("[PRODUCT-AUTH-READ-001] authorized project HTTP queries dispatch with a user actor", async () => {
    let capturedQuery: Query<unknown> | undefined;
    let capturedActor: ExecutionContext["actor"];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const projectQueryBus = {
      execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedActor = context.actor;
        capturedQuery = query as Query<unknown>;
        return ok({
          id: "prj_demo",
          name: "Demo Project",
          slug: "demo-project",
          lifecycleStatus: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: {
            kind: "user",
            id: "usr_member",
            label: "member@example.com",
          },
          email: "member@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_member",
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: projectQueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects/prj_demo", {
        headers: {
          cookie: "better-auth.session_token=test-member-session",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "prj_demo",
      lifecycleStatus: "active",
    });
    expect(capturedQuery).toBeInstanceOf(ShowProjectQuery);
    expect(capturedActor).toMatchObject({
      kind: "user",
      id: "usr_member",
    });
  });

  test("[PRODUCT-AUTH-READ-002] full organization team role flows into execution principal", async () => {
    let capturedPrincipal: ExecutionContext["principal"];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const projectQueryBus = {
      execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        expect(query).toBeInstanceOf(ShowProjectQuery);
        capturedPrincipal = context.principal;
        return ok({
          id: "prj_demo",
          name: "Demo Project",
          slug: "demo-project",
          lifecycleStatus: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: {
            kind: "user",
            id: "usr_billing",
            label: "billing@example.com",
          },
          email: "billing@example.com",
          organizationId: "org_self_hosted",
          organizationRole: "billing",
          role: input.requiredRole,
          userId: "usr_billing",
        }),
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: projectQueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects/prj_demo", {
        headers: {
          cookie: "better-auth.session_token=test-billing-session",
        },
      }),
    );
    const text = await response.text();

    expect(response.status, text).toBe(200);
    expect(capturedPrincipal).toMatchObject({
      activeOrganization: {
        organizationId: "org_self_hosted",
        productRole: "member",
        role: "billing",
      },
      userId: "usr_billing",
    });
  });

  test("[PRODUCT-AUTH-READ-001] project list uses member-level product authorization", async () => {
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    let capturedQuery: Query<unknown> | undefined;
    let capturedAuthorizationRequest:
      | Parameters<ProductSessionAuthorizationPort["authorizeProductSession"]>[1]
      | undefined;
    let queryBusHit = false;
    const projectQueryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        queryBusHit = true;
        capturedQuery = query as Query<unknown>;
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        capturedAuthorizationRequest = input;
        return ok({
          actor: {
            kind: "user",
            id: "usr_member",
            label: "member@example.com",
          },
          email: "member@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_member",
        });
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: projectQueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/projects", {
        headers: {
          cookie: "better-auth.session_token=test-member-session",
        },
      }),
    );

    const text = await response.text();
    expect(queryBusHit, text).toBe(true);
    expect(response.status, text).toBe(200);
    expect(JSON.parse(text)).toEqual({ items: [] });
    expect(capturedAuthorizationRequest).toMatchObject({
      path: "/api/projects",
      requiredRole: "member",
    });
    expect(capturedQuery).toBeInstanceOf(ListProjectsQuery);
  });

  test("[PRODUCT-AUTH-READ-001] environment/resource/deployment-target lists use member-level product authorization", async () => {
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    let capturedQuery: Query<unknown> | undefined;
    let capturedAuthorizationRequest:
      | Parameters<ProductSessionAuthorizationPort["authorizeProductSession"]>[1]
      | undefined;
    const readQueryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        capturedAuthorizationRequest = input;
        expect(input.requiredRole).toBe("member");
        return ok({
          actor: {
            kind: "user",
            id: "usr_member",
            label: "member@example.com",
          },
          email: "member@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_member",
        });
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: readQueryBus,
    });
    const cases = [
      {
        path: "http://localhost/api/environments?projectId=prj_demo",
        routePath: "/api/environments",
        queryType: ListEnvironmentsQuery,
      },
      {
        path: "http://localhost/api/resources?projectId=prj_demo",
        routePath: "/api/resources",
        queryType: ListResourcesQuery,
      },
      {
        path: "http://localhost/api/servers",
        routePath: "/api/servers",
        queryType: ListServersQuery,
      },
    ];

    for (const testCase of cases) {
      capturedQuery = undefined;
      capturedAuthorizationRequest = undefined;
      const response = await app.handle(
        new Request(testCase.path, {
          headers: {
            cookie: "better-auth.session_token=test-member-session",
          },
        }),
      );
      const text = await response.text();

      expect(
        response.status,
        `${testCase.routePath} ${capturedQuery?.constructor.name ?? "no-query"} ${text}`,
      ).toBe(200);
      expect(JSON.parse(text)).toEqual({ items: [] });
      expect(capturedAuthorizationRequest).toMatchObject({
        path: testCase.routePath,
        requiredRole: "member",
      });
      expect(capturedQuery).toBeInstanceOf(testCase.queryType);
    }
  });

  test("[PRODUCT-AUTH-READ-001] catalog-backed oRPC inventory queries use member-level product authorization", async () => {
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    let capturedQuery: Query<unknown> | undefined;
    let capturedAuthorizationRequest:
      | Parameters<ProductSessionAuthorizationPort["authorizeProductSession"]>[1]
      | undefined;
    const readQueryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        capturedAuthorizationRequest = input;
        expect(input.requiredRole).toBe("member");
        return ok({
          actor: {
            kind: "user",
            id: "usr_member",
            label: "member@example.com",
          },
          email: "member@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_member",
        });
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: readQueryBus,
    });
    const cases = [
      {
        path: "http://localhost/api/rpc/dependencyResources/list",
        routePath: "/api/rpc/dependencyResources/list",
        queryType: ListDependencyResourcesQuery,
      },
      {
        path: "http://localhost/api/rpc/domainBindings/list",
        routePath: "/api/rpc/domainBindings/list",
        queryType: ListDomainBindingsQuery,
      },
      {
        path: "http://localhost/api/rpc/certificates/list",
        routePath: "/api/rpc/certificates/list",
        queryType: ListCertificatesQuery,
      },
      {
        path: "http://localhost/api/rpc/providers/list",
        routePath: "/api/rpc/providers/list",
        queryType: ListProvidersQuery,
      },
    ];

    for (const testCase of cases) {
      capturedQuery = undefined;
      capturedAuthorizationRequest = undefined;
      await app.handle(
        new Request(testCase.path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: "better-auth.session_token=test-member-session",
          },
          body: JSON.stringify({ json: {} }),
        }),
      );
      expect(capturedAuthorizationRequest).toMatchObject({
        path: testCase.routePath,
        requiredRole: "member",
      });
      expect(capturedQuery).toBeInstanceOf(testCase.queryType);
    }
  });

  test("[PRODUCT-AUTH-GATE-003] bootstrap status endpoint stays public", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const bootstrapQueryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          bootstrapRequired: true,
          firstAdminConfigured: false,
          organizationConfigured: false,
          loginMethods: [
            {
              key: "local-password",
              configured: true,
              enabled: true,
            },
          ],
          loginUrl: "http://localhost:3721/login",
        } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async () => {
        throw new Error("product auth gate must not run for public bootstrap status");
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: bootstrapQueryBus,
    });

    const response = await app.handle(new Request("http://localhost/api/bootstrap/auth/status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      bootstrapRequired: true,
      firstAdminConfigured: false,
      loginMethods: [
        {
          key: "local-password",
          configured: true,
          enabled: true,
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(GetAuthBootstrapStatusQuery);
  });

  test("first-admin bootstrap endpoint stays public only while bootstrap is required", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          bootstrapRequired: false,
          created: true,
          email: "admin@example.com",
          loginMethods: [
            {
              key: "local-password",
              configured: true,
              enabled: true,
            },
          ],
          loginUrl: "http://localhost:3721/login",
          organizationId: "org_self_hosted",
          organizationSlug: "self-hosted-appaloft",
          userId: "usr_admin",
        } as T);
      },
    } as CommandBus;
    const bootstrapRequiredQueryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          bootstrapRequired: true,
          firstAdminConfigured: false,
          organizationConfigured: false,
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
          nextSteps: ["create-first-admin"],
        } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async () => {
        throw new Error("product auth gate must not run for first-admin bootstrap");
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: bootstrapRequiredQueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/bootstrap/auth/first-admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "admin@example.com",
          displayName: "Admin User",
          password: "local-admin-password",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      bootstrapRequired: false,
      created: true,
      email: "admin@example.com",
      organizationId: "org_self_hosted",
    });
    expect(capturedQuery).toBeInstanceOf(GetAuthBootstrapStatusQuery);
    expect(capturedCommand).toBeInstanceOf(BootstrapFirstAdminCommand);
    expect(capturedCommand).toMatchObject({
      email: "admin@example.com",
      displayName: "Admin User",
    });
  });

  test("[FIRST-ADMIN-BOOTSTRAP-007] first-admin bootstrap endpoint is hidden after setup", async () => {
    let commandDispatched = false;
    const commandBus = {
      execute: async () => {
        commandDispatched = true;
        throw new Error("command bus must not dispatch after first-admin bootstrap is complete");
      },
    } as unknown as CommandBus;
    const completeBootstrapQueryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        expect(query).toBeInstanceOf(GetAuthBootstrapStatusQuery);
        return ok({
          bootstrapRequired: false,
          firstAdminConfigured: true,
          organizationConfigured: true,
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
          firstAdminEmail: "admin@example.com",
          loginUrl: "http://localhost:3721/login",
          organizationId: "org_self_hosted",
          organizationSlug: "self-hosted-appaloft",
          nextSteps: ["sign-in"],
        } as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async () => {
        throw new Error("product auth gate must not run for disabled first-admin bootstrap");
      },
    };
    const app = mountProductAuthGateRoutes({
      commandBus,
      productSessionAuthorizationPort,
      queryBus: completeBootstrapQueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/bootstrap/auth/first-admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "local-admin-password",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "NOT_FOUND",
      data: {
        domainCode: "first_admin_bootstrap_disabled",
      },
    });
    expect(commandDispatched).toBe(false);
  });
});
