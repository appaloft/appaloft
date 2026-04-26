import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type LockEnvironmentCommandInput,
  type LockEnvironmentCommandPayload,
  lockEnvironmentCommandInputSchema,
} from "./lock-environment.schema";

export {
  type LockEnvironmentCommandInput,
  lockEnvironmentCommandInputSchema,
} from "./lock-environment.schema";

export class LockEnvironmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly environmentId: string,
    public readonly reason?: LockEnvironmentCommandPayload["reason"],
  ) {
    super();
  }

  static create(input: LockEnvironmentCommandInput): Result<LockEnvironmentCommand> {
    return parseOperationInput(lockEnvironmentCommandInputSchema, input).map(
      (parsed) => new LockEnvironmentCommand(parsed.environmentId, trimToUndefined(parsed.reason)),
    );
  }
}
