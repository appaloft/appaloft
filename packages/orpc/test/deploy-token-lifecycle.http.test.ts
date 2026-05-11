import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateDeployTokenCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListDeployTokensQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  RevokeDeployTokenCommand,
  RotateDeployTokenCommand,
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
      requestId: input.requestId ?? "req_orpc_deploy_token_lifecycle_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function deployTokenScope() {
  return {
    deploymentTargetIds: [],
    environmentIds: ["env_demo"],
    projectIds: ["prj_demo"],
    repositoryFullNames: ["acme/web"],
    resourceIds: ["res_web"],
    workflowCommands: ["source-link-deploy" as const],
  };
}

function deployTokenSummary(input?: Partial<ReturnType<typeof deployTokenSummaryBase>>) {
  return {
    ...deployTokenSummaryBase(),
    ...input,
  };
}

function deployTokenSummaryBase() {
  return {
    tokenId: "dpt_demo",
    organizationId: "org_self_hosted",
    displayName: "GitHub Action",
    status: "active" as const,
    secretSuffix: "12345678",
    scope: deployTokenScope(),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function adminProductSessionPort(): ProductSessionAuthorizationPort {
  return {
    authorizeProductSession: async (_context, input) => {
      expect(input.requiredRole).toBe("admin");
      expect(input.organizationId).toBe("org_self_hosted");
      return ok({
        actor: {
          kind: "user",
          id: "usr_admin",
          label: "admin@example.com",
        },
        email: "admin@example.com",
        organizationId: "org_self_hosted",
        role: "admin",
        userId: "usr_admin",
      });
    },
  };
}

function missingProductSessionPort(): ProductSessionAuthorizationPort {
  return {
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
}

function mountDeployTokenRoutes(input: {
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

describe("deploy-token lifecycle HTTP/oRPC routes", () => {
  test("create rejects missing product admin session before command dispatch", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("command bus must not dispatch without product auth");
      },
    } as unknown as CommandBus;
    const app = mountDeployTokenRoutes({
      commandBus,
      productSessionAuthorizationPort: missingProductSessionPort(),
      queryBus: {
        execute: async () => ok({} as never),
      } as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deploy-tokens", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          displayName: "GitHub Action",
          scope: deployTokenScope(),
        }),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).toContain("product_auth_missing");
  });

  test("authorized create dispatches through CreateDeployTokenCommand and returns raw token once", async () => {
    let capturedActor: ExecutionContext["actor"];
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedActor = context.actor;
        capturedCommand = command as Command<unknown>;
        return ok({
          tokenId: "dpt_demo",
          token: "aplt_dt_rawtokenvalue00000000",
          organizationId: "org_self_hosted",
          displayName: "GitHub Action",
          secretSuffix: "00000000",
          scopes: deployTokenScope(),
          createdAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as CommandBus;
    const app = mountDeployTokenRoutes({
      commandBus,
      productSessionAuthorizationPort: adminProductSessionPort(),
      queryBus: {
        execute: async () => ok({} as never),
      } as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deploy-tokens", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          displayName: "GitHub Action",
          scope: deployTokenScope(),
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      tokenId: "dpt_demo",
      token: "aplt_dt_rawtokenvalue00000000",
      secretSuffix: "00000000",
    });
    expect(capturedCommand).toBeInstanceOf(CreateDeployTokenCommand);
    expect(capturedActor).toMatchObject({ kind: "user", id: "usr_admin" });
  });

  test("protected list query requires product admin session and returns safe metadata only", async () => {
    let capturedActor: ExecutionContext["actor"];
    let capturedQuery: Query<unknown> | undefined;
    const app = mountDeployTokenRoutes({
      commandBus: {
        execute: async () => ok({} as never),
      } as CommandBus,
      productSessionAuthorizationPort: adminProductSessionPort(),
      queryBus: {
        execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedActor = context.actor;
          capturedQuery = query as Query<unknown>;
          return ok({ items: [deployTokenSummary()] } as T);
        },
      } as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deploy-tokens?organizationId=org_self_hosted", {
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [deployTokenSummary()],
    });
    expect(capturedQuery).toBeInstanceOf(ListDeployTokensQuery);
    expect(capturedActor).toMatchObject({ kind: "user", id: "usr_admin" });
  });

  test("show, rotate, and revoke routes dispatch through deploy-token lifecycle messages", async () => {
    const capturedMessages: string[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedMessages.push(command.constructor.name);
        if (command instanceof RotateDeployTokenCommand) {
          return ok({
            tokenId: "dpt_demo",
            token: "aplt_dt_rotatedrawtoken00000000",
            rotatedAt: "2026-01-01T00:10:00.000Z",
            scopes: deployTokenScope(),
          } as T);
        }
        if (command instanceof RevokeDeployTokenCommand) {
          return ok({
            tokenId: "dpt_demo",
            revokedAt: "2026-01-01T00:20:00.000Z",
          } as T);
        }
        throw new Error(`Unexpected command ${command.constructor.name}`);
      },
    } as CommandBus;
    const app = mountDeployTokenRoutes({
      commandBus,
      productSessionAuthorizationPort: adminProductSessionPort(),
      queryBus: {
        execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedMessages.push(query.constructor.name);
          return ok(deployTokenSummary() as T);
        },
      } as QueryBus,
    });

    const showResponse = await app.handle(
      new Request("http://localhost/api/deploy-tokens/dpt_demo?organizationId=org_self_hosted", {
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
        },
      }),
    );
    const rotateResponse = await app.handle(
      new Request("http://localhost/api/deploy-tokens/dpt_demo/rotate", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          confirmation: { tokenId: "dpt_demo" },
        }),
      }),
    );
    const revokeResponse = await app.handle(
      new Request("http://localhost/api/deploy-tokens/dpt_demo/revoke", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          confirmation: { tokenId: "dpt_demo" },
          reason: "rotated in CI",
        }),
      }),
    );

    expect(showResponse.status).toBe(200);
    expect(await showResponse.json()).toEqual(deployTokenSummary());
    expect(rotateResponse.status).toBe(200);
    expect(await rotateResponse.json()).toMatchObject({
      tokenId: "dpt_demo",
      token: "aplt_dt_rotatedrawtoken00000000",
    });
    expect(revokeResponse.status).toBe(200);
    expect(await revokeResponse.json()).toEqual({
      tokenId: "dpt_demo",
      revokedAt: "2026-01-01T00:20:00.000Z",
    });
    expect(capturedMessages).toEqual([
      "ShowDeployTokenQuery",
      "RotateDeployTokenCommand",
      "RevokeDeployTokenCommand",
    ]);
  });
});
