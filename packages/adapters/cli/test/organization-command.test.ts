import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

async function createCommandCaptureHarness(requestId: string) {
  ensureReflectMetadata();
  const { createCliProgram } = await import("../src");
  const commands: AppCommand<unknown>[] = [];
  const contexts: ExecutionContext[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(context: ExecutionContext, command: AppCommand<T>) => {
      contexts.push(context);
      commands.push(command as AppCommand<unknown>);
      if (command.constructor.name === "InviteOrganizationMemberCommand") {
        return ok({
          invitationId: "inv_operator",
          organizationId: "org_self_hosted",
          email: "operator@example.com",
          role: "developer",
          status: "pending",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (command.constructor.name === "ChangeOrganizationMemberRoleCommand") {
        return ok({
          memberId: "mem_operator",
          userId: "usr_operator",
          role: "admin",
          joinedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (command.constructor.name === "TransferOrganizationOwnerCommand") {
        return ok({
          fromMember: {
            memberId: "mem_admin",
            userId: "usr_admin",
            role: "admin",
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
          toMember: {
            memberId: "mem_operator",
            userId: "usr_operator",
            role: "owner",
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
          transferredAt: "2026-01-01T00:45:00.000Z",
        } as T);
      }
      if (command.constructor.name === "SwitchCurrentOrganizationCommand") {
        return ok({
          user: {
            userId: "usr_admin",
            email: "admin@example.com",
          },
          currentOrganization: {
            organizationId: "org_second",
            name: "Second",
            slug: "second",
            role: "admin",
          },
          organizations: [
            {
              organizationId: "org_self_hosted",
              name: "Self Hosted",
              slug: "self-hosted",
              role: "owner",
            },
            {
              organizationId: "org_second",
              name: "Second",
              slug: "second",
              role: "admin",
            },
          ],
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
        } as T);
      }
      return ok({
        memberId: "mem_operator",
        organizationId: "org_self_hosted",
        removedAt: "2026-01-01T00:30:00.000Z",
      } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(context: ExecutionContext, query: AppQuery<T>) => {
      contexts.push(context);
      queries.push(query as AppQuery<unknown>);
      if (query.constructor.name === "GetCurrentOrganizationContextQuery") {
        return ok({
          user: {
            userId: "usr_admin",
            email: "admin@example.com",
          },
          currentOrganization: {
            organizationId: "org_self_hosted",
            name: "Self Hosted",
            slug: "self-hosted",
            role: "owner",
          },
          organizations: [
            {
              organizationId: "org_self_hosted",
              name: "Self Hosted",
              slug: "self-hosted",
              role: "owner",
            },
          ],
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
        } as T);
      }
      if (query.constructor.name === "ListOrganizationMembersQuery") {
        return ok({
          items: [
            {
              memberId: "mem_admin",
              userId: "usr_admin",
              role: "owner",
              joinedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        } as T);
      }
      return ok({
        items: [
          {
            invitationId: "inv_operator",
            organizationId: "org_self_hosted",
            email: "operator@example.com",
            role: "developer",
            status: "pending",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as T);
    },
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus,
    queryBus,
    executionContextFactory,
  });

  return { commands, contexts, program, queries };
}

async function parseCli(program: { parseAsync(args: string[]): Promise<unknown> }, args: string[]) {
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await program.parseAsync(args);
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI organization commands", () => {
  test("[ORG-TEAM-CONTEXT-001] context dispatches GetCurrentOrganizationContextQuery", async () => {
    const { GetCurrentOrganizationContextQuery } = await import("@appaloft/application");
    const authCookie = process.env.APPALOFT_AUTH_COOKIE;
    process.env.APPALOFT_AUTH_COOKIE = "better-auth.session_token=test-admin-session";
    const { contexts, program, queries } = await createCommandCaptureHarness(
      "req_cli_organization_context_test",
    );

    try {
      await parseCli(program, ["node", "appaloft", "organization", "context"]);
    } finally {
      if (authCookie === undefined) {
        delete process.env.APPALOFT_AUTH_COOKIE;
      } else {
        process.env.APPALOFT_AUTH_COOKIE = authCookie;
      }
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(GetCurrentOrganizationContextQuery);
    expect(contexts[0]?.auth).toMatchObject({
      cookieHeader: "better-auth.session_token=test-admin-session",
    });
  });

  test("[ORG-TEAM-MEMBERS-001] member and invitation list commands dispatch organization queries", async () => {
    const { ListOrganizationInvitationsQuery, ListOrganizationMembersQuery } = await import(
      "@appaloft/application"
    );
    const { program, queries } = await createCommandCaptureHarness(
      "req_cli_organization_list_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "members",
      "list",
      "--organization-id",
      "org_self_hosted",
      "--limit",
      "20",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "invitations",
      "list",
      "--organization-id",
      "org_self_hosted",
      "--status",
      "pending",
    ]);

    expect(queries).toHaveLength(2);
    expect(queries[0]).toBeInstanceOf(ListOrganizationMembersQuery);
    expect(queries[0]).toMatchObject({ organizationId: "org_self_hosted", limit: 20 });
    expect(queries[1]).toBeInstanceOf(ListOrganizationInvitationsQuery);
    expect(queries[1]).toMatchObject({
      organizationId: "org_self_hosted",
      status: "pending",
    });
  });

  test("[ORG-TEAM-SWITCH-001] switch dispatches SwitchCurrentOrganizationCommand", async () => {
    const { SwitchCurrentOrganizationCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_organization_switch_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "switch",
      "org_second",
      "--idempotency-key",
      "idem_switch_org_second",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(SwitchCurrentOrganizationCommand);
    expect(commands[0]).toMatchObject({
      organizationId: "org_second",
      idempotencyKey: "idem_switch_org_second",
    });
  });

  test("[ORG-TEAM-INVITE-001] [ORG-TEAM-ROLE-001] [ORG-TEAM-REMOVE-001] [CLOUD-IDENTITY-MEMBER-REACTIVATE-004] [ORG-TEAM-OWNER-TRANSFER-001] member mutation commands dispatch organization commands", async () => {
    const {
      InviteOrganizationMemberCommand,
      RemoveOrganizationMemberCommand,
      ReactivateOrganizationMemberCommand,
      ChangeOrganizationMemberRoleCommand,
      TransferOrganizationOwnerCommand,
    } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_organization_member_mutation_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "member",
      "invite",
      "--organization-id",
      "org_self_hosted",
      "--email",
      "operator@example.com",
      "--role",
      "developer",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "member",
      "role",
      "mem_operator",
      "--organization-id",
      "org_self_hosted",
      "--role",
      "admin",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "member",
      "remove",
      "mem_operator",
      "--organization-id",
      "org_self_hosted",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "member",
      "restore",
      "mem_operator",
      "--organization-id",
      "org_self_hosted",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "organization",
      "owner",
      "transfer",
      "mem_admin",
      "mem_operator",
      "--organization-id",
      "org_self_hosted",
      "--idempotency-key",
      "idem_owner_transfer",
    ]);

    expect(commands).toHaveLength(5);
    expect(commands[0]).toBeInstanceOf(InviteOrganizationMemberCommand);
    expect(commands[0]).toMatchObject({
      organizationId: "org_self_hosted",
      email: "operator@example.com",
      role: "developer",
    });
    expect(commands[1]).toBeInstanceOf(ChangeOrganizationMemberRoleCommand);
    expect(commands[1]).toMatchObject({
      organizationId: "org_self_hosted",
      memberId: "mem_operator",
      role: "admin",
    });
    expect(commands[2]).toBeInstanceOf(RemoveOrganizationMemberCommand);
    expect(commands[2]).toMatchObject({
      organizationId: "org_self_hosted",
      memberId: "mem_operator",
    });
    expect(commands[3]).toBeInstanceOf(ReactivateOrganizationMemberCommand);
    expect(commands[3]).toMatchObject({
      organizationId: "org_self_hosted",
      memberId: "mem_operator",
    });
    expect(commands[4]).toBeInstanceOf(TransferOrganizationOwnerCommand);
    expect(commands[4]).toMatchObject({
      organizationId: "org_self_hosted",
      fromMemberId: "mem_admin",
      toMemberId: "mem_operator",
      idempotencyKey: "idem_owner_transfer",
    });
  });
});
