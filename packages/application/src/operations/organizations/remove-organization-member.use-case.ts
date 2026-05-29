import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type OrganizationMemberSummary,
  type OrganizationTeamManagementPort,
  type RemoveOrganizationMemberInput,
} from "../../ports";
import { tokens } from "../../tokens";
import { type RemoveOrganizationMemberResult } from "./remove-organization-member.command";

@injectable()
export class RemoveOrganizationMemberUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RemoveOrganizationMemberInput,
  ): Promise<Result<RemoveOrganizationMemberResult>> {
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

    if (member.role === "owner") {
      return err(
        domainError.invariant("Organization owners can only be removed after ownership transfer", {
          memberId: input.memberId,
          phase: "organization-remove-member",
        }),
      );
    }

    return this.organizationTeamManagement.removeMember(context, input);
  }
}

function findMember(
  members: readonly OrganizationMemberSummary[],
  memberId: string,
): OrganizationMemberSummary | undefined {
  return members.find((member) => member.memberId === memberId);
}
