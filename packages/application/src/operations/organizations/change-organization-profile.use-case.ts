import { err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type ChangeOrganizationProfileInput,
  type OperationGuardPort,
  type OrganizationTeamManagementPort,
} from "../../ports";
import { tokens } from "../../tokens";

const changeOrganizationProfileOperation = findOperationCatalogEntryByKey(
  "organizations.profile.change",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class ChangeOrganizationProfileUseCase {
  constructor(
    @inject(tokens.organizationTeamManagementPort)
    private readonly organizationTeamManagement: OrganizationTeamManagementPort,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(context: ExecutionContext, input: ChangeOrganizationProfileInput) {
    if (changeOrganizationProfileOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: changeOrganizationProfileOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        organizationId: input.organizationId,
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

    return this.organizationTeamManagement.changeOrganizationProfile(context, input);
  }
}
