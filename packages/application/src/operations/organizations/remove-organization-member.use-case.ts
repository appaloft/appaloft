import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type OrganizationTeamManagementPort,
  type RemoveOrganizationMemberInput,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class RemoveOrganizationMemberUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  execute(context: ExecutionContext, input: RemoveOrganizationMemberInput) {
    return this.organizationTeamManagement.removeMember(context, input);
  }
}
