import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type OrganizationTeamManagementPort } from "../../ports";
import { tokens } from "../../tokens";
import { type ListOrganizationMembersQuery } from "./list-organization-members.query";

@injectable()
export class ListOrganizationMembersQueryService {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, query: ListOrganizationMembersQuery) {
    return this.organizationTeamManagement.listMembers(context, {
      organizationId: query.organizationId,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }
}
