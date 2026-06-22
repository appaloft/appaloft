import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { err, ok, type Result } from "@appaloft/core";
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

function createTestApp(input: {
  authRuntime?: Parameters<typeof createHttpApp>[0]["authRuntime"];
  commandBus?: CommandBus;
  queryBus?: QueryBus;
}) {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: input.authRuntime ? "better-auth" : "none",
        webOrigin: "https://app.example.com",
        betterAuthTrustedOrigins: ["https://agent.example.com"],
        webStaticDir: "",
      },
    }),
    commandBus: input.commandBus ?? ({} as unknown as CommandBus),
    queryBus: input.queryBus ?? ({} as unknown as QueryBus),
    logger: new SilentLogger(),
    executionContextFactory: {
      create(contextInput) {
        return createExecutionContext(contextInput);
      },
    },
    ...(input.authRuntime ? { authRuntime: input.authRuntime } : {}),
  });
}

describe("MCP HTTP transport", () => {
  test("[APPALOFT-MCP-011] exposes /mcp HTTP metadata and JSON-RPC tools/list", async () => {
    const app = createTestApp({});

    const metadataResponse = await app.handle(new Request("http://localhost/mcp"));
    const metadata = await metadataResponse.json();

    expect(metadataResponse.status).toBe(200);
    expect(metadata).toMatchObject({
      schemaVersion: "appaloft.mcp.http-endpoint/v1",
      transport: "streamable-http",
      methods: ["POST"],
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    });

    const listResponse = await app.handle(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      }),
    );
    const list = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(list.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "deployments_create",
          operationKey: "deployments.create",
        }),
      ]),
    );
  });

  test("[APPALOFT-MCP-012] dispatches /mcp tool calls with mcp entrypoint and product session actor", async () => {
    let capturedContext: ExecutionContext | undefined;
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedContext = context;
        capturedCommand = command as Command<unknown>;
        return ok({ id: "prj_mcp" } as T);
      },
    } as CommandBus;
    const authRuntime: Parameters<typeof createHttpApp>[0]["authRuntime"] = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: {
            kind: "user",
            id: "usr_mcp",
            label: "mcp@example.com",
          },
          email: "mcp@example.com",
          organizationId: "org_mcp",
          role: input.requiredRole,
          userId: "usr_mcp",
        }),
      getPublicConfig: () => ({
        provider: "better-auth",
        loginRequired: true,
        deferredAuth: false,
        providers: [],
      }),
      getSessionStatus: async () => ({
        accountSecurity: {
          enabled: true,
          passwordState: "set",
        },
        accountRecovery: {
          enabled: false,
        },
        enabled: true,
        emailVerification: {
          enabled: false,
          otpEnabled: false,
          required: false,
        },
        provider: "better-auth",
        loginRequired: true,
        deferredAuth: false,
        session: null,
        providers: [],
      }),
      handle: () => new Response("not used", { status: 404 }),
    };
    const app = createTestApp({
      authRuntime,
      commandBus,
    });

    const response = await app.handle(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-mcp-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "call-1",
          method: "tools/call",
          params: {
            name: "projects_create",
            arguments: {
              name: "MCP Demo",
            },
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.structuredContent).toEqual({ id: "prj_mcp" });
    expect(capturedCommand?.constructor.name).toBe("CreateProjectCommand");
    expect(capturedContext).toMatchObject({
      actor: {
        kind: "user",
        id: "usr_mcp",
      },
      entrypoint: "mcp",
      principal: {
        userId: "usr_mcp",
        activeOrganization: {
          organizationId: "org_mcp",
          productRole: "member",
        },
      },
    });
  });

  test("[APPALOFT-MCP-013] rejects /mcp tool calls without a product session before dispatch", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("MCP command bus must not dispatch without product auth");
      },
    } as unknown as CommandBus;
    const authRuntime: Parameters<typeof createHttpApp>[0]["authRuntime"] = {
      authorizeProductSession: async () =>
        err({
          code: "product_auth_missing",
          category: "user",
          message: "Product operation requires a valid session",
          retryable: false,
        }),
      getPublicConfig: () => ({
        provider: "better-auth",
        loginRequired: true,
        deferredAuth: false,
        providers: [],
      }),
      getSessionStatus: async () => ({
        accountSecurity: {
          enabled: true,
          passwordState: "set",
        },
        accountRecovery: {
          enabled: false,
        },
        enabled: true,
        emailVerification: {
          enabled: false,
          otpEnabled: false,
          required: false,
        },
        provider: "better-auth",
        loginRequired: true,
        deferredAuth: false,
        session: null,
        providers: [],
      }),
      handle: () => new Response("not used", { status: 404 }),
    };
    const app = createTestApp({
      authRuntime,
      commandBus,
    });

    const response = await app.handle(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "call-2",
          method: "tools/call",
          params: {
            name: "projects_create",
            arguments: {
              name: "MCP Demo",
            },
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("product_auth_missing");
  });
});
