import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AccountSettingsPort, type RevokeAccountSessionInput } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class RevokeAccountSessionUseCase {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
  ) {}

  execute(context: ExecutionContext, input: RevokeAccountSessionInput) {
    return this.accountSettings.revokeAccountSession(context, input);
  }
}
