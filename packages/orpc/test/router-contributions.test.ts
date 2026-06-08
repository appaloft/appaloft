import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import { os } from "@orpc/server";
import { Elysia } from "elysia";
import { z } from "zod";
import {
  createAppaloftOpenApiHandler,
  createAppaloftOrpcRouter,
  mountAppaloftOrpcRoutes,
} from "../src/index";

class CapturingLogger implements AppLogger {
  readonly errors: Array<{ message: string; context?: Record<string, unknown> }> = [];

  debug(): void {}
  info(): void {}
  warn(): void {}
  error(message: string, context?: Record<string, unknown>): void {
    this.errors.push({ message, context });
  }
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_router_contribution_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("Appaloft oRPC router contributions", () => {
  test("mounts an additional neutral router namespace", async () => {
    const extensionRouter = {
      extensions: {
        ping: os
          .route({
            method: "GET",
            path: "/extensions/ping",
            successStatus: 200,
          })
          .output(z.object({ ok: z.boolean() }))
          .handler(() => ({ ok: true })),
      },
    };

    const handler = createAppaloftOpenApiHandler({
      orpcRouterContributions: [extensionRouter],
    });
    const { matched, response } = await handler.handle(
      new Request("http://localhost/api/extensions/ping"),
      {
        prefix: "/api",
        context: {},
      },
    );

    expect(matched).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("mounts contribution OpenAPI routes at their declared HTTP path", async () => {
    const extensionRouter = {
      extensions: {
        ping: os
          .route({
            method: "POST",
            path: "/extensions/ping",
            successStatus: 202,
          })
          .input(z.object({ name: z.string() }))
          .output(z.object({ ok: z.boolean(), name: z.string() }))
          .handler(({ input }) => ({ ok: true, name: input.name })),
      },
    };
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: {} as CommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new CapturingLogger(),
      queryBus: {} as QueryBus,
      orpcRouterContributions: [extensionRouter],
    });

    const response = await app.handle(
      new Request("http://localhost/extensions/ping", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "contribution" }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, name: "contribution" });
  });

  test("rejects contributions that overwrite the public router", () => {
    expect(() =>
      createAppaloftOrpcRouter({
        orpcRouterContributions: [{ projects: {} }],
      }),
    ).toThrow('Appaloft oRPC router contribution conflicts at "projects".');
  });

  test("logs raw procedure errors before oRPC maps them to internal server errors", async () => {
    const logger = new CapturingLogger();
    const extensionRouter = {
      extensions: {
        explode: os
          .route({
            method: "GET",
            path: "/extensions/explode",
            successStatus: 200,
          })
          .handler(() => {
            throw new Error("database relation cloud_tenants does not exist");
          }),
      },
    };

    const handler = createAppaloftOpenApiHandler({
      logger,
      orpcRouterContributions: [extensionRouter],
    });
    const { matched, response } = await handler.handle(
      new Request("http://localhost/api/extensions/explode"),
      {
        prefix: "/api",
        context: {
          executionContext: createExecutionContext({
            entrypoint: "http",
            requestId: "req_orpc_raw_error_logging_test",
          }),
        },
      },
    );

    expect(matched).toBe(true);
    expect(response.status).toBe(500);
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toMatchObject({
      message: "orpc_procedure_unhandled_error",
      context: {
        path: "extensions.explode",
        requestId: "req_orpc_raw_error_logging_test",
        entrypoint: "http",
        name: "Error",
        message: "database relation cloud_tenants does not exist",
      },
    });
    expect(logger.errors[0]?.context?.stack).toContain(
      "database relation cloud_tenants does not exist",
    );
  });

  test("mounts server runtime prepare at its generated HTTP path", async () => {
    const commands: unknown[] = [];
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: {
        async execute(_context, command) {
          commands.push(command);
          return ok({
            serverId: "srv_route",
            status: "ready",
            preparedAt: "2026-05-17T00:00:00.000Z",
            steps: [
              {
                phase: "docker",
                status: "succeeded",
                message: "Docker is already available",
                durationMs: 0,
              },
            ],
          });
        },
      } as CommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new CapturingLogger(),
      productSessionAuthorizationPort: {
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
      } satisfies ProductSessionAuthorizationPort,
      queryBus: {} as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/servers/srv_route/runtime/prepare", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({ serverId: "srv_route", mode: "repair" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      serverId: "srv_route",
      status: "ready",
    });
    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command && typeof command === "object" ? command.constructor.name : "").toBe(
      "PrepareServerRuntimeCommand",
    );
  });
});
