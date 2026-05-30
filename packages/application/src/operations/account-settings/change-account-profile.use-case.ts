import { err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  type AccountSettingsPort,
  AllowAllOperationGuardPort,
  type ChangeAccountProfileInput,
  type OperationGuardPort,
} from "../../ports";
import { tokens } from "../../tokens";

const changeAccountProfileOperation = findOperationCatalogEntryByKey("account.profile.change");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class ChangeAccountProfileUseCase {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(context: ExecutionContext, input: ChangeAccountProfileInput) {
    if (changeAccountProfileOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: changeAccountProfileOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

    return this.accountSettings.changeAccountProfile(context, input);
  }
}
