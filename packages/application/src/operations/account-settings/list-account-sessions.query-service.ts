import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AccountSettingsPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListAccountSessionsQueryService {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
  ) {}

  execute(context: ExecutionContext) {
    return this.accountSettings.listAccountSessions(context);
  }
}
