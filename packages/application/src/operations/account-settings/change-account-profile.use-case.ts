import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AccountSettingsPort, type ChangeAccountProfileInput } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ChangeAccountProfileUseCase {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
  ) {}

  execute(context: ExecutionContext, input: ChangeAccountProfileInput) {
    return this.accountSettings.changeAccountProfile(context, input);
  }
}
