import { domainError, err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type InviteOrganizationMemberInput,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class InviteOrganizationMemberUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  async execute(context: ExecutionContext, input: InviteOrganizationMemberInput) {
    const targetEmail = normalizeEmail(input.email);
    const members = await this.organizationTeamManagement.listMembers(context, {
      organizationId: input.organizationId,
    });
    if (members.isErr()) {
      return err(members.error);
    }

    const activeMember = members.value.items.find(
      (member) => normalizeEmail(member.email) === targetEmail && member.status !== "deactivated",
    );
    if (activeMember) {
      return err(
        domainError.conflict("Organization member already exists", {
          email: targetEmail,
          memberId: activeMember.memberId,
          organizationId: input.organizationId,
          phase: "organization-invite-member",
        }),
      );
    }

    const invitations = await this.organizationTeamManagement.listInvitations(context, {
      organizationId: input.organizationId,
      status: "pending",
    });
    if (invitations.isErr()) {
      return err(invitations.error);
    }

    const activeInvitation = invitations.value.items.find(
      (invitation) => normalizeEmail(invitation.email) === targetEmail,
    );
    if (activeInvitation) {
      return err(
        domainError.conflict("Organization invitation already exists", {
          email: targetEmail,
          invitationId: activeInvitation.invitationId,
          organizationId: input.organizationId,
          phase: "organization-invite-member",
        }),
      );
    }

    return this.organizationTeamManagement.inviteMember(context, input);
  }
}

function normalizeEmail(email: string | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}
