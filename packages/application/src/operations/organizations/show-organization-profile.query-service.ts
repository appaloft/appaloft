import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type OrganizationTeamManagementPort } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowOrganizationProfileQuery } from "./show-organization-profile.query";

@injectable()
export class ShowOrganizationProfileQueryService {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, query: ShowOrganizationProfileQuery) {
    return this.organizationTeamManagement.showOrganizationProfile(context, {
      organizationId: query.organizationId,
    });
  }
}
