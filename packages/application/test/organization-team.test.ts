import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  ChangeOrganizationMemberRoleCommand,
  ChangeOrganizationMemberRoleCommandHandler,
  type ChangeOrganizationMemberRoleInput,
  ChangeOrganizationMemberRoleUseCase,
  type CurrentOrganizationContext,
  createExecutionContext,
  type ExecutionContext,
  GetCurrentOrganizationContextQuery,
  GetCurrentOrganizationContextQueryHandler,
  GetCurrentOrganizationContextQueryService,
  InviteOrganizationMemberCommand,
  InviteOrganizationMemberCommandHandler,
  type InviteOrganizationMemberInput,
  InviteOrganizationMemberUseCase,
  ListOrganizationInvitationsQuery,
  ListOrganizationInvitationsQueryHandler,
  ListOrganizationInvitationsQueryService,
  ListOrganizationMembersQuery,
  ListOrganizationMembersQueryHandler,
  ListOrganizationMembersQueryService,
  type OrganizationInvitationListInput,
  type OrganizationInvitationSummary,
  type OrganizationMemberListInput,
  type OrganizationMemberSummary,
  type OrganizationTeamManagementPort,
  operationCatalog,
  RemoveOrganizationMemberCommand,
  RemoveOrganizationMemberCommandHandler,
  type RemoveOrganizationMemberInput,
  RemoveOrganizationMemberUseCase,
  SwitchCurrentOrganizationCommand,
  SwitchCurrentOrganizationCommandHandler,
  type SwitchCurrentOrganizationInput,
  SwitchCurrentOrganizationUseCase,
} from "../src";

const context = createExecutionContext({ entrypoint: "http" });

const currentContext: CurrentOrganizationContext = {
  user: {
    userId: "usr_admin",
    email: "admin@example.com",
    displayName: "Admin User",
  },
  currentOrganization: {
    organizationId: "org_self_hosted",
    name: "Self-hosted Appaloft",
    slug: "self-hosted-appaloft",
    role: "owner",
  },
  organizations: [
    {
      organizationId: "org_self_hosted",
      name: "Self-hosted Appaloft",
      slug: "self-hosted-appaloft",
      role: "owner",
    },
  ],
  loginMethods: [{ key: "local-password", configured: true, enabled: true }],
  permissions: {
    canInviteMembers: true,
    canListMembers: true,
    canManageDeployTokens: true,
    canRemoveMembers: true,
    canUpdateMemberRoles: true,
  },
};

const member: OrganizationMemberSummary = {
  memberId: "om_admin",
  userId: "usr_admin",
  email: "admin@example.com",
  displayName: "Admin User",
  role: "owner",
  joinedAt: "2026-01-01T00:00:00.000Z",
};

const invitation: OrganizationInvitationSummary = {
  invitationId: "inv_operator",
  organizationId: "org_self_hosted",
  email: "operator@example.com",
  role: "developer",
  status: "pending",
  createdAt: "2026-01-01T00:01:00.000Z",
};

class CapturingOrganizationTeamManagementPort implements OrganizationTeamManagementPort {
  readonly calls: string[] = [];
  readonly inputs: unknown[] = [];

  async getCurrentContext(_context: ExecutionContext): Promise<Result<CurrentOrganizationContext>> {
    this.calls.push("getCurrentContext");
    return ok(currentContext);
  }

  async listMembers(
    _context: ExecutionContext,
    input: OrganizationMemberListInput,
  ): Promise<Result<{ items: OrganizationMemberSummary[]; nextCursor?: string }>> {
    this.calls.push("listMembers");
    this.inputs.push(input);
    return ok({ items: [member], nextCursor: "next-members" });
  }

  async switchCurrentOrganization(
    _context: ExecutionContext,
    input: SwitchCurrentOrganizationInput,
  ): Promise<Result<CurrentOrganizationContext>> {
    this.calls.push("switchCurrentOrganization");
    this.inputs.push(input);
    return ok({
      ...currentContext,
      currentOrganization: {
        organizationId: input.organizationId,
        name: "Second Appaloft",
        slug: "second-appaloft",
        role: "admin",
      },
    });
  }

  async listInvitations(
    _context: ExecutionContext,
    input: OrganizationInvitationListInput,
  ): Promise<Result<{ items: OrganizationInvitationSummary[]; nextCursor?: string }>> {
    this.calls.push("listInvitations");
    this.inputs.push(input);
    return ok({ items: [invitation], nextCursor: "next-invitations" });
  }

  async inviteMember(
    _context: ExecutionContext,
    input: InviteOrganizationMemberInput,
  ): Promise<Result<OrganizationInvitationSummary>> {
    this.calls.push("inviteMember");
    this.inputs.push(input);
    return ok({ ...invitation, email: input.email, role: input.role });
  }

  async updateMemberRole(
    _context: ExecutionContext,
    input: ChangeOrganizationMemberRoleInput,
  ): Promise<Result<OrganizationMemberSummary>> {
    this.calls.push("updateMemberRole");
    this.inputs.push(input);
    return ok({ ...member, memberId: input.memberId, role: input.role });
  }

  async removeMember(
    _context: ExecutionContext,
    input: RemoveOrganizationMemberInput,
  ): Promise<Result<{ memberId: string; organizationId: string; removedAt: string }>> {
    this.calls.push("removeMember");
    this.inputs.push(input);
    return ok({
      memberId: input.memberId,
      organizationId: input.organizationId,
      removedAt: "2026-01-01T00:02:00.000Z",
    });
  }
}

describe("organization/team application boundary", () => {
  test("[ORG-TEAM-CONTEXT-001] current context query uses the Appaloft-owned port", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const service = new GetCurrentOrganizationContextQueryService(port);
    const handler = new GetCurrentOrganizationContextQueryHandler(service);
    const query = GetCurrentOrganizationContextQuery.create({})._unsafeUnwrap();

    const result = await handler.handle(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(currentContext);
    expect(port.calls).toEqual(["getCurrentContext"]);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("providerToken");
  });

  test("[ORG-TEAM-MEMBERS-001] member and invitation queries reuse organization/team port inputs", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const membersHandler = new ListOrganizationMembersQueryHandler(
      new ListOrganizationMembersQueryService(port),
    );
    const invitationsHandler = new ListOrganizationInvitationsQueryHandler(
      new ListOrganizationInvitationsQueryService(port),
    );

    const members = await membersHandler.handle(
      context,
      ListOrganizationMembersQuery.create({
        organizationId: "org_self_hosted",
        limit: 25,
      })._unsafeUnwrap(),
    );
    const invitations = await invitationsHandler.handle(
      context,
      ListOrganizationInvitationsQuery.create({
        organizationId: "org_self_hosted",
        status: "pending",
      })._unsafeUnwrap(),
    );

    expect(members._unsafeUnwrap()).toEqual({ items: [member], nextCursor: "next-members" });
    expect(invitations._unsafeUnwrap()).toEqual({
      items: [invitation],
      nextCursor: "next-invitations",
    });
    expect(port.inputs).toEqual([
      { organizationId: "org_self_hosted", limit: 25 },
      { organizationId: "org_self_hosted", status: "pending" },
    ]);
  });

  test("[ORG-TEAM-SWITCH-001] switches current organization through the Appaloft-owned port", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const result = await new SwitchCurrentOrganizationCommandHandler(
      new SwitchCurrentOrganizationUseCase(port),
    ).handle(
      context,
      SwitchCurrentOrganizationCommand.create({
        organizationId: "org_second",
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().currentOrganization).toMatchObject({
      organizationId: "org_second",
      role: "admin",
    });
    expect(port.calls).toEqual(["switchCurrentOrganization"]);
    expect(port.inputs).toEqual([{ organizationId: "org_second" }]);
  });

  test("[ORG-TEAM-INVITE-001] rejects duplicate active membership before creating an invitation", async () => {
    const port = new CapturingOrganizationTeamManagementPort();

    const result = await new InviteOrganizationMemberCommandHandler(
      new InviteOrganizationMemberUseCase(port),
    ).handle(
      context,
      InviteOrganizationMemberCommand.create({
        organizationId: "org_self_hosted",
        email: "ADMIN@example.com",
        role: "developer",
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        email: "admin@example.com",
        memberId: "om_admin",
        organizationId: "org_self_hosted",
        phase: "organization-invite-member",
      },
    });
    expect(port.calls).toEqual(["listMembers"]);
  });

  test("[ORG-TEAM-INVITE-001] rejects duplicate pending invitation before creating another invitation", async () => {
    const port = new CapturingOrganizationTeamManagementPort();

    const result = await new InviteOrganizationMemberCommandHandler(
      new InviteOrganizationMemberUseCase(port),
    ).handle(
      context,
      InviteOrganizationMemberCommand.create({
        organizationId: "org_self_hosted",
        email: "OPERATOR@example.com",
        role: "developer",
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        email: "operator@example.com",
        invitationId: "inv_operator",
        organizationId: "org_self_hosted",
        phase: "organization-invite-member",
      },
    });
    expect(port.calls).toEqual(["listMembers", "listInvitations"]);
  });

  test("[ORG-TEAM-INVITE-001] [ORG-TEAM-ROLE-001] [ORG-TEAM-REMOVE-001] commands dispatch through the port", async () => {
    const port = new CapturingOrganizationTeamManagementPort();

    const invite = await new InviteOrganizationMemberCommandHandler(
      new InviteOrganizationMemberUseCase(port),
    ).handle(
      context,
      InviteOrganizationMemberCommand.create({
        organizationId: "org_self_hosted",
        email: "new-operator@example.com",
        role: "developer",
      })._unsafeUnwrap(),
    );
    const role = await new ChangeOrganizationMemberRoleCommandHandler(
      new ChangeOrganizationMemberRoleUseCase(port),
    ).handle(
      context,
      ChangeOrganizationMemberRoleCommand.create({
        organizationId: "org_self_hosted",
        memberId: "om_operator",
        role: "admin",
      })._unsafeUnwrap(),
    );
    const remove = await new RemoveOrganizationMemberCommandHandler(
      new RemoveOrganizationMemberUseCase(port),
    ).handle(
      context,
      RemoveOrganizationMemberCommand.create({
        organizationId: "org_self_hosted",
        memberId: "om_operator",
      })._unsafeUnwrap(),
    );

    expect(invite._unsafeUnwrap()).toMatchObject({ email: "new-operator@example.com" });
    expect(role._unsafeUnwrap()).toMatchObject({ memberId: "om_operator", role: "admin" });
    expect(remove._unsafeUnwrap()).toMatchObject({ memberId: "om_operator" });
    expect(port.calls).toEqual([
      "listMembers",
      "listInvitations",
      "inviteMember",
      "updateMemberRole",
      "removeMember",
    ]);
  });

  test("operation catalog includes organization/team HTTP/oRPC transport entries", () => {
    const entries = operationCatalog.filter((entry) => entry.domain === "organizations");

    expect(entries.map((entry) => entry.key)).toEqual([
      "organizations.current-context",
      "organizations.switch-current",
      "organizations.list-members",
      "organizations.list-invitations",
      "organizations.invite-member",
      "organizations.change-member-role",
      "organizations.remove-member",
    ]);
    expect(entries.map((entry) => entry.transports.orpc?.path)).toEqual([
      "/api/organizations/current-context",
      "/api/organizations/current-context/switch",
      "/api/organizations/{organizationId}/members",
      "/api/organizations/{organizationId}/invitations",
      "/api/organizations/{organizationId}/invitations",
      "/api/organizations/{organizationId}/members/{memberId}/role",
      "/api/organizations/{organizationId}/members/{memberId}",
    ]);
    expect(entries.map((entry) => entry.transports.cli)).toEqual([
      "appaloft organization context",
      "appaloft organization switch <organizationId>",
      "appaloft organization members list",
      "appaloft organization invitations list",
      "appaloft organization member invite",
      "appaloft organization member role <memberId>",
      "appaloft organization member remove <memberId>",
    ]);
  });
});
