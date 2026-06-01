import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type OrganizationMemberSummary,
  type OrganizationTeamManagementPort,
  type ReactivateOrganizationMemberInput,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ReactivateOrganizationMemberResult } from "./reactivate-organization-member.command";

@injectable()
export class ReactivateOrganizationMemberUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ReactivateOrganizationMemberInput,
  ): Promise<Result<ReactivateOrganizationMemberResult>> {
    const members = await this.organizationTeamManagement.listMembers(context, {
      organizationId: input.organizationId,
      limit: 250,
    });

    if (members.isErr()) {
      return err(members.error);
    }

    const member = findMember(members.value.items, input.memberId);

    if (!member) {
      return err(domainError.notFound("organization_member", input.memberId));
    }

    if (member.status !== "deactivated") {
      return err(
        domainError.invariant("Only deactivated organization members can be reactivated", {
          memberId: input.memberId,
          phase: "organization-reactivate-member",
        }),
      );
    }

    return this.organizationTeamManagement.reactivateMember(context, input);
  }
}

function findMember(
  members: readonly OrganizationMemberSummary[],
  memberId: string,
): OrganizationMemberSummary | undefined {
  return members.find((member) => member.memberId === memberId);
}
