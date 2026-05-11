import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type OrganizationTeamManagementPort } from "../../ports";
import { tokens } from "../../tokens";
import { type ListOrganizationInvitationsQuery } from "./list-organization-invitations.query";

@injectable()
export class ListOrganizationInvitationsQueryService {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, query: ListOrganizationInvitationsQuery) {
    return this.organizationTeamManagement.listInvitations(context, {
      organizationId: query.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }
}
