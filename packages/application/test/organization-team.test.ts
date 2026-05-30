import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  ChangeOrganizationMemberRoleCommand,
  ChangeOrganizationMemberRoleCommandHandler,
  type ChangeOrganizationMemberRoleInput,
  ChangeOrganizationMemberRoleUseCase,
  ChangeOrganizationProfileCommand,
  ChangeOrganizationProfileCommandHandler,
  type ChangeOrganizationProfileInput,
  ChangeOrganizationProfileUseCase,
  type CurrentOrganizationContext,
  createExecutionContext,
  DeleteOrganizationCommand,
  DeleteOrganizationCommandHandler,
  DeleteOrganizationUseCase,
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
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  type OrganizationInvitationListInput,
  type OrganizationInvitationSummary,
  type OrganizationMemberListInput,
  type OrganizationMemberSummary,
  type OrganizationProfileSummary,
  type OrganizationTeamManagementPort,
  type OrganizationTeamRole,
  operationCatalog,
  RemoveOrganizationMemberCommand,
  RemoveOrganizationMemberCommandHandler,
  type RemoveOrganizationMemberInput,
  RemoveOrganizationMemberUseCase,
  ShowOrganizationProfileQuery,
  ShowOrganizationProfileQueryHandler,
  ShowOrganizationProfileQueryService,
  SwitchCurrentOrganizationCommand,
  SwitchCurrentOrganizationCommandHandler,
  type SwitchCurrentOrganizationInput,
  SwitchCurrentOrganizationUseCase,
  TransferOrganizationOwnerCommand,
  TransferOrganizationOwnerCommandHandler,
  type TransferOrganizationOwnerInput,
  TransferOrganizationOwnerUseCase,
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
    canTransferOwnership: true,
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

const operatorMember: OrganizationMemberSummary = {
  memberId: "om_operator",
  userId: "usr_operator",
  email: "existing-operator@example.com",
  displayName: "Operator User",
  role: "developer",
  joinedAt: "2026-01-01T00:02:00.000Z",
};

const invitation: OrganizationInvitationSummary = {
  invitationId: "inv_operator",
  organizationId: "org_self_hosted",
  email: "operator@example.com",
  role: "developer",
  status: "pending",
  createdAt: "2026-01-01T00:01:00.000Z",
};

const profile: OrganizationProfileSummary = {
  organizationId: "org_self_hosted",
  name: "Self-hosted Appaloft",
  slug: "self-hosted-appaloft",
  role: "owner",
  logoUrl: "https://example.com/logo.png",
  permissions: {
    canInviteMembers: true,
    canListMembers: true,
    canManageDeployTokens: true,
    canRemoveMembers: true,
    canTransferOwnership: true,
    canUpdateMemberRoles: true,
  },
};

class CapturingOrganizationTeamManagementPort implements OrganizationTeamManagementPort {
  readonly calls: string[] = [];
  readonly inputs: unknown[] = [];

  async getCurrentContext(_context: ExecutionContext): Promise<Result<CurrentOrganizationContext>> {
    this.calls.push("getCurrentContext");
    return ok(currentContext);
  }

  async showOrganizationProfile(
    _context: ExecutionContext,
    input: { organizationId: string },
  ): Promise<Result<OrganizationProfileSummary>> {
    this.calls.push("showOrganizationProfile");
    this.inputs.push(input);
    return ok({ ...profile, organizationId: input.organizationId });
  }

  async changeOrganizationProfile(
    _context: ExecutionContext,
    input: ChangeOrganizationProfileInput,
  ): Promise<Result<OrganizationProfileSummary>> {
    this.calls.push("changeOrganizationProfile");
    this.inputs.push(input);
    const { logoUrl: _logoUrl, ...profileWithoutLogo } = profile;
    return ok({
      ...profileWithoutLogo,
      organizationId: input.organizationId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
    });
  }

  async deleteOrganization(
    _context: ExecutionContext,
    input: { organizationId: string; confirmation: { organizationId: string } },
  ): Promise<Result<{ organizationId: string; deletedAt: string }>> {
    this.calls.push("deleteOrganization");
    this.inputs.push(input);
    return ok({
      organizationId: input.organizationId,
      deletedAt: "2026-01-01T00:03:00.000Z",
    });
  }

  async listMembers(
    _context: ExecutionContext,
    input: OrganizationMemberListInput,
  ): Promise<Result<{ items: OrganizationMemberSummary[]; nextCursor?: string }>> {
    this.calls.push("listMembers");
    this.inputs.push(input);
    return ok({ items: [member, operatorMember], nextCursor: "next-members" });
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

  async transferOwner(
    _context: ExecutionContext,
    input: TransferOrganizationOwnerInput,
  ): Promise<
    Result<{
      fromMember: OrganizationMemberSummary;
      toMember: OrganizationMemberSummary;
      transferredAt: string;
    }>
  > {
    this.calls.push("transferOwner");
    this.inputs.push(input);
    return ok({
      fromMember: { ...member, memberId: input.fromMemberId, role: "admin" },
      toMember: { ...operatorMember, memberId: input.toMemberId, role: "owner" },
      transferredAt: "2026-01-01T00:04:00.000Z",
    });
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

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
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

  test("[ORG-TEAM-INVITE-GUARD-001] invite member can be denied before team port side effects", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const guard = new DenyingOperationGuardPort();
    const useCase = new InviteOrganizationMemberUseCase(port, guard);

    const result = await useCase.execute(context, {
      organizationId: "org_self_hosted",
      email: "operator@example.com",
      role: "developer",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "organizations.invite-member",
        organizationId: "org_self_hosted",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "organizations.invite-member",
      organizationId: "org_self_hosted",
    });
    expect(port.calls).toEqual([]);
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

    expect(members._unsafeUnwrap()).toEqual({
      items: [member, operatorMember],
      nextCursor: "next-members",
    });
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

  test("[ORG-SETTINGS-PROFILE-001] organization profile read/change use Appaloft-owned settings methods", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const show = await new ShowOrganizationProfileQueryHandler(
      new ShowOrganizationProfileQueryService(port),
    ).handle(
      context,
      ShowOrganizationProfileQuery.create({
        organizationId: "org_self_hosted",
      })._unsafeUnwrap(),
    );
    const update = await new ChangeOrganizationProfileCommandHandler(
      new ChangeOrganizationProfileUseCase(port),
    ).handle(
      context,
      ChangeOrganizationProfileCommand.create({
        organizationId: "org_self_hosted",
        name: "Renamed Organization",
        slug: "renamed-organization",
        logoUrl: null,
      })._unsafeUnwrap(),
    );

    expect(show._unsafeUnwrap()).toEqual(profile);
    expect(update._unsafeUnwrap()).toMatchObject({
      organizationId: "org_self_hosted",
      name: "Renamed Organization",
      slug: "renamed-organization",
    });
    expect(update._unsafeUnwrap().logoUrl).toBeUndefined();
    expect(port.calls).toEqual(["showOrganizationProfile", "changeOrganizationProfile"]);
  });

  test("[ORG-SETTINGS-GUARD-001] organization profile changes can be denied before settings port side effects", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const guard = new DenyingOperationGuardPort();
    const result = await new ChangeOrganizationProfileUseCase(port, guard).execute(context, {
      organizationId: "org_self_hosted",
      name: "Blocked Organization",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "organizations.profile.change",
        organizationId: "org_self_hosted",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "organizations.profile.change",
      organizationId: "org_self_hosted",
    });
    expect(port.calls).toEqual([]);
  });

  test("[ORG-SETTINGS-DANGER-001] exact organization-id confirmation is required before delete dispatch", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const handler = new DeleteOrganizationCommandHandler(new DeleteOrganizationUseCase(port));

    const rejected = await handler.handle(
      context,
      DeleteOrganizationCommand.create({
        organizationId: "org_self_hosted",
        confirmation: {
          organizationId: "org_other",
        },
      })._unsafeUnwrap(),
    );
    const deleted = await handler.handle(
      context,
      DeleteOrganizationCommand.create({
        organizationId: "org_self_hosted",
        confirmation: {
          organizationId: "org_self_hosted",
        },
      })._unsafeUnwrap(),
    );

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "organization-danger-zone",
      },
    });
    expect(deleted._unsafeUnwrap()).toEqual({
      organizationId: "org_self_hosted",
      deletedAt: "2026-01-01T00:03:00.000Z",
    });
    expect(port.calls).toEqual(["deleteOrganization"]);
  });

  test("[ORG-SETTINGS-GUARD-002] organization deletion can be denied after confirmation but before delete side effects", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const guard = new DenyingOperationGuardPort();
    const result = await new DeleteOrganizationUseCase(port, guard).execute(context, {
      organizationId: "org_self_hosted",
      confirmation: {
        organizationId: "org_self_hosted",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "organizations.delete",
        organizationId: "org_self_hosted",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "organizations.delete",
      organizationId: "org_self_hosted",
    });
    expect(port.calls).toEqual([]);
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
      "listMembers",
      "updateMemberRole",
      "listMembers",
      "removeMember",
    ]);
  });

  test("[ORG-TEAM-ROLE-001] rejects owner role changes through the generic role command", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const handler = new ChangeOrganizationMemberRoleCommandHandler(
      new ChangeOrganizationMemberRoleUseCase(port),
    );

    const ownerTarget = await handler.handle(
      context,
      ChangeOrganizationMemberRoleCommand.create({
        organizationId: "org_self_hosted",
        memberId: "om_admin",
        role: "admin",
      })._unsafeUnwrap(),
    );
    const ownerRole = await handler.handle(
      context,
      ChangeOrganizationMemberRoleCommand.create({
        organizationId: "org_self_hosted",
        memberId: "om_operator",
        role: "owner",
      })._unsafeUnwrap(),
    );

    expect(ownerTarget.isErr()).toBe(true);
    expect(ownerTarget._unsafeUnwrapErr()).toMatchObject({
      code: "invariant_violation",
      details: {
        memberId: "om_admin",
        phase: "organization-change-member-role",
      },
    });
    expect(ownerRole.isErr()).toBe(true);
    expect(ownerRole._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        memberId: "om_operator",
        phase: "organization-change-member-role",
      },
    });
    expect(port.calls).toEqual(["listMembers"]);
  });

  test("[ORG-TEAM-REMOVE-001] rejects owner removal through the generic remove command", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const result = await new RemoveOrganizationMemberCommandHandler(
      new RemoveOrganizationMemberUseCase(port),
    ).handle(
      context,
      RemoveOrganizationMemberCommand.create({
        organizationId: "org_self_hosted",
        memberId: "om_admin",
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invariant_violation",
      details: {
        memberId: "om_admin",
        phase: "organization-remove-member",
      },
    });
    expect(port.calls).toEqual(["listMembers"]);
  });

  test("[ORG-TEAM-OWNER-TRANSFER-001] transfers ownership through the dedicated command", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const result = await new TransferOrganizationOwnerCommandHandler(
      new TransferOrganizationOwnerUseCase(port),
    ).handle(
      context,
      TransferOrganizationOwnerCommand.create({
        organizationId: "org_self_hosted",
        fromMemberId: "om_admin",
        toMemberId: "om_operator",
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      fromMember: { memberId: "om_admin", role: "admin" },
      toMember: { memberId: "om_operator", role: "owner" },
    });
    expect(port.calls).toEqual(["listMembers", "transferOwner"]);
  });

  test("[ORG-TEAM-GUARD-001] ownership transfer can be denied before team port side effects", async () => {
    const port = new CapturingOrganizationTeamManagementPort();
    const guard = new DenyingOperationGuardPort();
    const result = await new TransferOrganizationOwnerUseCase(port, guard).execute(context, {
      organizationId: "org_self_hosted",
      fromMemberId: "om_admin",
      toMemberId: "om_operator",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "organizations.transfer-owner",
        organizationId: "org_self_hosted",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "organizations.transfer-owner",
      organizationId: "org_self_hosted",
    });
    expect(port.calls).toEqual([]);
  });

  test("[ORG-TEAM-ROLE-002] preserves non-owner organization team roles at the application boundary", async () => {
    const roles: OrganizationTeamRole[] = ["admin", "billing", "developer", "viewer"];
    const port = new CapturingOrganizationTeamManagementPort();
    const handler = new ChangeOrganizationMemberRoleCommandHandler(
      new ChangeOrganizationMemberRoleUseCase(port),
    );

    for (const role of roles) {
      const result = await handler.handle(
        context,
        ChangeOrganizationMemberRoleCommand.create({
          organizationId: "org_self_hosted",
          memberId: "om_operator",
          role,
        })._unsafeUnwrap(),
      );

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({
        memberId: "om_operator",
        role,
      });
    }

    expect(
      port.inputs
        .filter(
          (input): input is ChangeOrganizationMemberRoleInput =>
            input !== null && typeof input === "object" && "memberId" in input && "role" in input,
        )
        .map((input) => input.role),
    ).toEqual(roles);
  });

  test("operation catalog includes organization/team HTTP/oRPC transport entries", () => {
    const entries = operationCatalog.filter((entry) => entry.domain === "organizations");

    expect(entries.map((entry) => entry.key)).toEqual([
      "organizations.current-context",
      "organizations.profile.show",
      "organizations.profile.change",
      "organizations.delete",
      "organizations.switch-current",
      "organizations.list-members",
      "organizations.list-invitations",
      "organizations.invite-member",
      "organizations.change-member-role",
      "organizations.remove-member",
      "organizations.transfer-owner",
    ]);
    expect(entries.map((entry) => entry.transports.orpc?.path)).toEqual([
      "/api/organizations/current-context",
      "/api/organizations/{organizationId}/profile",
      "/api/organizations/{organizationId}/profile",
      "/api/organizations/{organizationId}",
      "/api/organizations/current-context/switch",
      "/api/organizations/{organizationId}/members",
      "/api/organizations/{organizationId}/invitations",
      "/api/organizations/{organizationId}/invitations",
      "/api/organizations/{organizationId}/members/{memberId}/role",
      "/api/organizations/{organizationId}/members/{memberId}",
      "/api/organizations/{organizationId}/owner-transfer",
    ]);
    expect(
      entries.map((entry) => ("cli" in entry.transports ? entry.transports.cli : undefined)),
    ).toEqual([
      "appaloft organization context",
      undefined,
      undefined,
      undefined,
      "appaloft organization switch <organizationId>",
      "appaloft organization members list",
      "appaloft organization invitations list",
      "appaloft organization member invite",
      "appaloft organization member role <memberId>",
      "appaloft organization member remove <memberId>",
      "appaloft organization owner transfer <fromMemberId> <toMemberId>",
    ]);
    expect(entries.find((entry) => entry.key === "organizations.transfer-owner")).toMatchObject({
      transportAccess: {
        productSession: {
          minRole: "owner",
        },
      },
    });
  });
});
