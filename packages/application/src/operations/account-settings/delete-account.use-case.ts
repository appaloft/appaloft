import { domainError, err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AccountSettingsPort, type DeleteAccountInput } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeleteAccountUseCase {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
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

    return this.accountSettings.deleteAccount(context, input);
  }
}
