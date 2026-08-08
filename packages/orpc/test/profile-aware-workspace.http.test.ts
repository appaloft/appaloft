import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  BindProjectRepositoryCommand,
  type Command,
  type CommandBus,
  ConfigureAgentWorkspaceProfileCredentialConnectionsCommand,
  ConfigureAgentWorkspaceProfileMcpConnectionsCommand,
  ConfigureProjectWorkspaceProfileCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  OpenAgentWorkspaceCommand,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  ShowRepositoryBindingQuery,
  type TenantContextResolver,
  UnbindRepositoryCommand,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

const authorization: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: { kind: "user", id: "usr_workspace", label: "workspace@example.test" },
      email: "workspace@example.test",
      organizationId: input.organizationId ?? "org_workspace",
      role: input.requiredRole,
      userId: "usr_workspace",
    }),
};

const contextFactory: ExecutionContextFactory = {
  create: (input) =>
    createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: input.requestId ?? "req_workspace_http",
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
    }),
};

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function request(path: string, init: RequestInit): Request {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("cookie", "better-auth.session_token=workspace-http-test");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe("Profile-aware Workspace HTTP routes", () => {
  test("[WS-OPEN-SURFACE-019][GH-AUTO-TENANT-022] dispatches open and configuration through the composed router", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const dispatchedContexts: ExecutionContext[] = [];
    const profile = {
      installationId: "awpi_default",
      definitionDigest: `sha256:${"1".repeat(64)}`,
      profileId: "pi-default",
      profileVersion: "1.0.0",
      displayName: "Pi Default",
      adapterDefinitionDigest: `sha256:${"2".repeat(64)}`,
      status: "enabled",
      installedAt: "2026-07-29T00:00:00.000Z",
      credentialConnections: [{ requirementId: "model-api", connectionReference: "conn_model" }],
      mcpConnections: [
        { requirementId: "appaloft-tools", connectionReference: "mcpconn_appaloft" },
      ],
    };
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        dispatchedContexts.push(context);
        commands.push(command as Command<unknown>);
        if (command instanceof ConfigureProjectWorkspaceProfileCommand) {
          return ok({
            projectId: command.input.projectId,
            profileInstallationId: command.input.profileInstallationId,
          } as T);
        }
        if (command instanceof ConfigureAgentWorkspaceProfileCredentialConnectionsCommand) {
          return ok(profile as T);
        }
        if (command instanceof ConfigureAgentWorkspaceProfileMcpConnectionsCommand) {
          return ok(profile as T);
        }
        return ok({ accepted: true } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        dispatchedContexts.push(context);
        queries.push(query as Query<unknown>);
        return ok({ repositoryIdentity: "github.com/Acme/Web" } as T);
      },
    } as QueryBus;
    const tenantContextResolver: TenantContextResolver = {
      async resolveTenantContext(context) {
        return {
          ...(context.tenant ?? { tenantId: "tenant_instance" }),
          tenantId: `resolved_${context.tenant?.tenantId ?? "tenant_instance"}`,
        };
      },
    };
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: contextFactory,
      logger,
      productSessionAuthorizationPort: authorization,
      queryBus,
      tenantContextResolver,
    });

    const calls = [
      request("/api/workspaces/open", {
        method: "POST",
        body: JSON.stringify({
          repository: "https://github.com/Acme/Web.git",
          repositoryIdentity: "github.com/Acme/Web",
          ref: "refs/heads/main",
          branch: "main",
          commitSha: "0123456789abcdef0123456789abcdef01234567",
          profile: "awpi_default",
          attach: false,
        }),
      }),
      request("/api/projects/prj_web/workspace-profile", {
        method: "POST",
        body: JSON.stringify({
          projectId: "prj_web",
          profileInstallationId: "awpi_default",
        }),
      }),
      request("/api/agent-workspace-profiles/awpi_default/credential-connections", {
        method: "POST",
        body: JSON.stringify({
          installationId: "awpi_default",
          connections: [{ requirementId: "model-api", connectionReference: "conn_model" }],
        }),
      }),
      request("/api/agent-workspace-profiles/awpi_default/mcp-connections", {
        method: "POST",
        body: JSON.stringify({
          installationId: "awpi_default",
          connections: [
            { requirementId: "appaloft-tools", connectionReference: "mcpconn_appaloft" },
          ],
        }),
      }),
      request("/api/repository-bindings", {
        method: "POST",
        body: JSON.stringify({
          repositoryIdentity: "github.com/Acme/Web",
          projectId: "prj_web",
        }),
      }),
      request("/api/repository-bindings/github.com%2FAcme%2FWeb", {
        method: "GET",
      }),
      request("/api/repository-bindings/github.com%2FAcme%2FWeb", {
        method: "DELETE",
      }),
    ];
    const responses = await Promise.all(calls.map((call) => app.handle(call)));

    expect(responses.map((response) => response.status)).toEqual([
      202, 200, 200, 200, 200, 200, 200,
    ]);
    expect(commands.some((command) => command instanceof OpenAgentWorkspaceCommand)).toBe(true);
    expect(
      commands.some((command) => command instanceof ConfigureProjectWorkspaceProfileCommand),
    ).toBe(true);
    expect(
      commands.some(
        (command) => command instanceof ConfigureAgentWorkspaceProfileCredentialConnectionsCommand,
      ),
    ).toBe(true);
    expect(
      commands.some(
        (command) => command instanceof ConfigureAgentWorkspaceProfileMcpConnectionsCommand,
      ),
    ).toBe(true);
    expect(commands.some((command) => command instanceof BindProjectRepositoryCommand)).toBe(true);
    expect(commands.some((command) => command instanceof UnbindRepositoryCommand)).toBe(true);
    expect(queries.some((query) => query instanceof ShowRepositoryBindingQuery)).toBe(true);
    expect(dispatchedContexts).not.toHaveLength(0);
    expect(
      dispatchedContexts.every((context) => context.tenant?.tenantId === "resolved_org_workspace"),
    ).toBe(true);
  });
});
