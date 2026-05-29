import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AccountSettingsPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ShowAccountProfileQueryService {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
  ) {}

  execute(context: ExecutionContext) {
    return this.accountSettings.showAccountProfile(context);
  }
}
