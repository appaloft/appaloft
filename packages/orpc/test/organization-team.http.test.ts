import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  ChangeOrganizationMemberRoleCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  GetCurrentOrganizationContextQuery,
  InviteOrganizationMemberCommand,
  ListOrganizationInvitationsQuery,
  ListOrganizationMembersQuery,
  type ProductOrganizationRole,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  RemoveOrganizationMemberCommand,
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
      requestId: input.requestId ?? "req_orpc_organization_team_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      auth: input.auth,
    });
  }
}

function mountOrganizationTeamRoutes(input: {
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

function productSessionPort(input?: {
  expectedRole?: ProductOrganizationRole;
  expectedRoles?: ProductOrganizationRole[];
  organizationId?: string;
}): ProductSessionAuthorizationPort {
  const expectedRoles = input?.expectedRoles ? [...input.expectedRoles] : null;
  return {
    authorizeProductSession: async (_context, request) => {
      const expectedRole = expectedRoles?.shift() ?? input?.expectedRole ?? "admin";
      expect(request.requiredRole).toBe(expectedRole);
      if (input?.organizationId) {
        expect(request.organizationId).toBe(input.organizationId);
      }
      return ok({
        actor: {
          kind: "user",
          id: "usr_admin",
          label: "admin@example.com",
        },
        email: "admin@example.com",
        organizationId: request.organizationId ?? "org_self_hosted",
        role: expectedRole,
        userId: "usr_admin",
      });
    },
  };
}

function missingProductSessionPort(): ProductSessionAuthorizationPort {
  return {
    authorizeProductSession: async (_context, request) =>
      err({
        code: "product_auth_missing",
        category: "user",
        message: "Product operation requires a valid session",
        retryable: false,
        details: {
          endpoint: request.path,
          phase: "product-authentication",
          requiredRole: request.requiredRole,
        },
      }),
  };
}

function currentContextResponse() {
  return {
    user: {
      userId: "usr_admin",
      email: "admin@example.com",
      displayName: "Admin",
    },
    currentOrganization: {
      organizationId: "org_self_hosted",
      name: "Self Hosted",
      slug: "self-hosted",
      role: "owner" as const,
    },
    organizations: [
      {
        organizationId: "org_self_hosted",
        name: "Self Hosted",
        slug: "self-hosted",
        role: "owner" as const,
      },
    ],
    loginMethods: [
      {
        key: "local-password" as const,
        configured: true,
        enabled: true,
      },
    ],
    permissions: {
      canInviteMembers: true,
      canListMembers: true,
      canManageDeployTokens: true,
      canRemoveMembers: true,
      canUpdateMemberRoles: true,
    },
  };
}

function memberSummary(input?: Partial<ReturnType<typeof memberSummaryBase>>) {
  return { ...memberSummaryBase(), ...input };
}

function memberSummaryBase() {
  return {
    memberId: "mem_admin",
    userId: "usr_admin",
    role: "owner" as const,
    joinedAt: "2026-01-01T00:00:00.000Z",
    email: "admin@example.com",
    displayName: "Admin",
  };
}

function invitationSummary() {
  return {
    invitationId: "inv_demo",
    organizationId: "org_self_hosted",
    email: "operator@example.com",
    role: "developer" as const,
    status: "pending" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
  };
}

describe("organization/team HTTP/oRPC routes", () => {
  test("[ORG-TEAM-AUTH-001] current context rejects missing product sessions before query dispatch", async () => {
    const app = mountOrganizationTeamRoutes({
      commandBus: {
        execute: async () => ok({} as never),
      } as CommandBus,
      productSessionAuthorizationPort: missingProductSessionPort(),
      queryBus: {
        execute: async () => {
          throw new Error("query bus must not dispatch without product auth");
        },
      } as unknown as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/organizations/current-context"),
    );
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).toContain("product_auth_missing");
  });

  test("[ORG-TEAM-CONTEXT-001] current context dispatches through QueryBus with session auth context", async () => {
    let capturedActor: ExecutionContext["actor"];
    let capturedAuth: ExecutionContext["auth"];
    let capturedQuery: Query<unknown> | undefined;
    const app = mountOrganizationTeamRoutes({
      commandBus: {
        execute: async () => ok({} as never),
      } as CommandBus,
      productSessionAuthorizationPort: productSessionPort({ expectedRole: "member" }),
      queryBus: {
        execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedActor = context.actor;
          capturedAuth = context.auth;
          capturedQuery = query as Query<unknown>;
          return ok(currentContextResponse() as T);
        },
      } as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/organizations/current-context", {
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(currentContextResponse());
    expect(capturedQuery).toBeInstanceOf(GetCurrentOrganizationContextQuery);
    expect(capturedActor).toMatchObject({ kind: "user", id: "usr_admin" });
    expect(capturedAuth).toMatchObject({
      cookieHeader: "better-auth.session_token=test-admin-session",
    });
  });

  test("[ORG-TEAM-SWITCH-001] switch current organization dispatches through CommandBus", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const switchedContext = {
      ...currentContextResponse(),
      currentOrganization: {
        organizationId: "org_second",
        name: "Second",
        slug: "second",
        role: "admin" as const,
      },
    };
    const app = mountOrganizationTeamRoutes({
      commandBus: {
        execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
          expect(context.actor).toMatchObject({ kind: "user", id: "usr_admin" });
          capturedCommand = command as Command<unknown>;
          return ok(switchedContext as T);
        },
      } as CommandBus,
      productSessionAuthorizationPort: productSessionPort({
        expectedRole: "member",
        organizationId: "org_second",
      }),
      queryBus: {
        execute: async () => ok({} as never),
      } as QueryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/organizations/current-context/switch", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({ organizationId: "org_second" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(switchedContext);
    expect(capturedCommand).toBeInstanceOf(SwitchCurrentOrganizationCommand);
  });

  test("[ORG-TEAM-MEMBERS-001] member and invitation list routes dispatch safe queries", async () => {
    const capturedQueries: string[] = [];
    const app = mountOrganizationTeamRoutes({
      commandBus: {
        execute: async () => ok({} as never),
      } as CommandBus,
      productSessionAuthorizationPort: productSessionPort({
        expectedRoles: ["member", "admin"],
        organizationId: "org_self_hosted",
      }),
      queryBus: {
        execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedQueries.push(query.constructor.name);
          if (query instanceof ListOrganizationMembersQuery) {
            return ok({ items: [memberSummary()], nextCursor: "next_members" } as T);
          }
          if (query instanceof ListOrganizationInvitationsQuery) {
            return ok({ items: [invitationSummary()], nextCursor: "next_invites" } as T);
          }
          throw new Error(`Unexpected query ${query.constructor.name}`);
        },
      } as QueryBus,
    });

    const memberResponse = await app.handle(
      new Request(
        "http://localhost/api/organizations/org_self_hosted/members?limit=1&cursor=cursor_1",
        {
          headers: {
            cookie: "better-auth.session_token=test-admin-session",
          },
        },
      ),
    );
    const invitationResponse = await app.handle(
      new Request("http://localhost/api/organizations/org_self_hosted/invitations?status=pending", {
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
        },
      }),
    );

    expect(memberResponse.status).toBe(200);
    expect(await memberResponse.json()).toEqual({
      items: [memberSummary()],
      nextCursor: "next_members",
    });
    expect(invitationResponse.status).toBe(200);
    expect(await invitationResponse.json()).toEqual({
      items: [invitationSummary()],
      nextCursor: "next_invites",
    });
    expect(capturedQueries).toEqual([
      "ListOrganizationMembersQuery",
      "ListOrganizationInvitationsQuery",
    ]);
  });

  test("[ORG-TEAM-INVITE-001] [ORG-TEAM-ROLE-001] [ORG-TEAM-REMOVE-001] mutation routes dispatch organization commands", async () => {
    const capturedCommands: string[] = [];
    const app = mountOrganizationTeamRoutes({
      commandBus: {
        execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
          capturedCommands.push(command.constructor.name);
          if (command instanceof InviteOrganizationMemberCommand) {
            return ok(invitationSummary() as T);
          }
          if (command instanceof ChangeOrganizationMemberRoleCommand) {
            return ok(memberSummary({ role: "developer" }) as T);
          }
          if (command instanceof RemoveOrganizationMemberCommand) {
            return ok({
              memberId: "mem_operator",
              organizationId: "org_self_hosted",
              removedAt: "2026-01-01T00:30:00.000Z",
            } as T);
          }
          throw new Error(`Unexpected command ${command.constructor.name}`);
        },
      } as CommandBus,
      productSessionAuthorizationPort: productSessionPort({
        expectedRole: "admin",
        organizationId: "org_self_hosted",
      }),
      queryBus: {
        execute: async () => ok({} as never),
      } as QueryBus,
    });

    const inviteResponse = await app.handle(
      new Request("http://localhost/api/organizations/org_self_hosted/invitations", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          email: "operator@example.com",
          role: "developer",
        }),
      }),
    );
    const roleResponse = await app.handle(
      new Request("http://localhost/api/organizations/org_self_hosted/members/mem_operator/role", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          memberId: "mem_operator",
          role: "developer",
        }),
      }),
    );
    const removeResponse = await app.handle(
      new Request("http://localhost/api/organizations/org_self_hosted/members/mem_operator", {
        method: "DELETE",
        headers: {
          cookie: "better-auth.session_token=test-admin-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org_self_hosted",
          memberId: "mem_operator",
        }),
      }),
    );

    expect(inviteResponse.status).toBe(201);
    expect(await inviteResponse.json()).toEqual(invitationSummary());
    expect(roleResponse.status).toBe(200);
    expect(await roleResponse.json()).toEqual(memberSummary({ role: "developer" }));
    expect(removeResponse.status).toBe(200);
    expect(await removeResponse.json()).toEqual({
      memberId: "mem_operator",
      organizationId: "org_self_hosted",
      removedAt: "2026-01-01T00:30:00.000Z",
    });
    expect(capturedCommands).toEqual([
      "InviteOrganizationMemberCommand",
      "ChangeOrganizationMemberRoleCommand",
      "RemoveOrganizationMemberCommand",
    ]);
  });
});
