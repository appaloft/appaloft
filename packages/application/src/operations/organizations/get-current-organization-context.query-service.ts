import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type OrganizationTeamManagementPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class GetCurrentOrganizationContextQueryService {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext) {
    return this.organizationTeamManagement.getCurrentContext(context);
  }
}
