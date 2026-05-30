import { domainError, err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type DeleteOrganizationInput,
  type OperationGuardPort,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

const deleteOrganizationOperation = findOperationCatalogEntryByKey("organizations.delete");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class DeleteOrganizationUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
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

    if (deleteOrganizationOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: deleteOrganizationOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        organizationId: input.organizationId,
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

    return this.organizationTeamManagement.deleteOrganization(context, input);
  }
}
