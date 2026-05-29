import { domainError, err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type InviteOrganizationMemberInput,
  type OperationGuardPort,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

const inviteOrganizationMemberOperation = findOperationCatalogEntryByKey(
  "organizations.invite-member",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class InviteOrganizationMemberUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(context: ExecutionContext, input: InviteOrganizationMemberInput) {
    const targetEmail = normalizeEmail(input.email);
    if (inviteOrganizationMemberOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: inviteOrganizationMemberOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        organizationId: input.organizationId,
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

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
