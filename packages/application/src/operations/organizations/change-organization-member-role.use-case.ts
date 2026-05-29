import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ChangeOrganizationMemberRoleInput,
  type OrganizationMemberSummary,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ChangeOrganizationMemberRoleUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ChangeOrganizationMemberRoleInput,
  ): Promise<Result<OrganizationMemberSummary>> {
    if (input.role === "owner") {
      return err(
        domainError.validation("Organization owner changes require the transfer-owner command", {
          memberId: input.memberId,
          phase: "organization-change-member-role",
        }),
      );
    }

    const members = await this.organizationTeamManagement.listMembers(context, {
      organizationId: input.organizationId,
      limit: 250,
    });

    if (members.isErr()) {
      return err(members.error);
    }

    const member = members.value.items.find((item) => item.memberId === input.memberId);

    if (!member) {
      return err(domainError.notFound("organization_member", input.memberId));
    }

    if (member.role === "owner") {
      return err(
        domainError.invariant("Organization owners can only be changed by ownership transfer", {
          memberId: input.memberId,
          phase: "organization-change-member-role",
        }),
      );
    }

    return this.organizationTeamManagement.updateMemberRole(context, input);
  }
}
