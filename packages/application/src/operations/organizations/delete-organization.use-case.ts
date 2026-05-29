import { domainError, err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type DeleteOrganizationInput, type OrganizationTeamManagementPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeleteOrganizationUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
  ) {}

  async execute(context: ExecutionContext, input: DeleteOrganizationInput) {
    if (input.confirmation.organizationId !== input.organizationId) {
      return err(
        domainError.validation("Organization id confirmation does not match", {
          actualOrganizationId: input.confirmation.organizationId,
          expectedOrganizationId: input.organizationId,
          organizationId: input.organizationId,
          phase: "organization-danger-zone",
        }),
      );
    }

    return this.organizationTeamManagement.deleteOrganization(context, input);
  }
}
