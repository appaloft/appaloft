import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ChangeOrganizationMemberRoleInput,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ChangeOrganizationMemberRoleUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, input: ChangeOrganizationMemberRoleInput) {
    return this.organizationTeamManagement.updateMemberRole(context, input);
  }
}
