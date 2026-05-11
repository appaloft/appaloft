import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type OrganizationTeamManagementPort,
  type SwitchCurrentOrganizationInput,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class SwitchCurrentOrganizationUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, input: SwitchCurrentOrganizationInput) {
    return this.organizationTeamManagement.switchCurrentOrganization(context, input);
  }
}
