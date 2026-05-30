import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type OrganizationMemberSummary,
  type OrganizationTeamManagementPort,
  type TransferOrganizationOwnerInput,
} from "../../ports";
import { tokens } from "../../tokens";
import { type TransferOrganizationOwnerResult } from "./transfer-organization-owner.command";

@injectable()
export class TransferOrganizationOwnerUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: TransferOrganizationOwnerInput,
  ): Promise<Result<TransferOrganizationOwnerResult>> {
    const members = await this.organizationTeamManagement.listMembers(context, {
      organizationId: input.organizationId,
      limit: 250,
    });

    if (members.isErr()) {
      return err(members.error);
    }

    const fromMember = findMember(members.value.items, input.fromMemberId);
    const toMember = findMember(members.value.items, input.toMemberId);

    if (!fromMember) {
      return err(domainError.notFound("organization_member", input.fromMemberId));
    }

    if (!toMember) {
      return err(domainError.notFound("organization_member", input.toMemberId));
    }

    if (fromMember.memberId === toMember.memberId) {
      return err(
        domainError.validation("Organization ownership transfer requires a different member", {
          memberId: input.fromMemberId,
          phase: "organization-transfer-owner",
        }),
      );
    }

    if (fromMember.role !== "owner") {
      return err(
        domainError.invariant("Organization ownership can only be transferred from an owner", {
          fromMemberId: input.fromMemberId,
          phase: "organization-transfer-owner",
        }),
      );
    }

    return this.organizationTeamManagement.transferOwner(context, input);
  }
}

function findMember(
  members: readonly OrganizationMemberSummary[],
  memberId: string,
): OrganizationMemberSummary | undefined {
  return members.find((member) => member.memberId === memberId);
}
