import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ChangeOrganizationProfileInput,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ChangeOrganizationProfileUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, input: ChangeOrganizationProfileInput) {
    return this.organizationTeamManagement.changeOrganizationProfile(context, input);
  }
}
