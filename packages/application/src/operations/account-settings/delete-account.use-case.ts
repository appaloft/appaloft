import { domainError, err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  type AccountSettingsPort,
  AllowAllOperationGuardPort,
  type DeleteAccountInput,
  type OperationGuardPort,
} from "../../ports";
import { tokens } from "../../tokens";

const deleteAccountOperation = findOperationCatalogEntryByKey("account.delete");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class DeleteAccountUseCase {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(context: ExecutionContext, input: DeleteAccountInput) {
    const profile = await this.accountSettings.showAccountProfile(context);
    if (profile.isErr()) {
      return err(profile.error);
    }

    if (input.confirmation.userId !== profile.value.userId) {
      return err(
        domainError.validation("Account id confirmation does not match", {
          actualUserId: input.confirmation.userId,
          expectedUserId: profile.value.userId,
          phase: "account-danger-zone",
          userId: profile.value.userId,
        }),
      );
    }

    if (deleteAccountOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: deleteAccountOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        contextAttributes: {
          accountUserId: profile.value.userId,
        },
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

    return this.accountSettings.deleteAccount(context, input);
  }
}
