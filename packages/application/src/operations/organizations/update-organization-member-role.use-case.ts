import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type OrganizationTeamManagementPort,
  type UpdateOrganizationMemberRoleInput,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class UpdateOrganizationMemberRoleUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, input: UpdateOrganizationMemberRoleInput) {
    return this.organizationTeamManagement.updateMemberRole(context, input);
  }
}
