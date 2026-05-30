import { err } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  type AccountSettingsPort,
  AllowAllOperationGuardPort,
  type OperationGuardPort,
  type RevokeAccountSessionInput,
} from "../../ports";
import { tokens } from "../../tokens";

const revokeAccountSessionOperation = findOperationCatalogEntryByKey("account.sessions.revoke");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class RevokeAccountSessionUseCase {
  constructor(
    @inject(tokens.accountSettingsPort)
    private readonly accountSettings: AccountSettingsPort,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(context: ExecutionContext, input: RevokeAccountSessionInput) {
    if (revokeAccountSessionOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: revokeAccountSessionOperation,
        message: input,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        resourceRefs: {
          sessionId: input.sessionId,
        },
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

    return this.accountSettings.revokeAccountSession(context, input);
  }
}
