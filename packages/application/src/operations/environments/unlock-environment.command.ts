import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type UnlockEnvironmentCommandInput,
  unlockEnvironmentCommandInputSchema,
} from "./unlock-environment.schema";

export {
  type UnlockEnvironmentCommandInput,
  unlockEnvironmentCommandInputSchema,
} from "./unlock-environment.schema";

export class UnlockEnvironmentCommand extends Command<{ id: string }> {
  constructor(public readonly environmentId: string) {
    super();
  }

  static create(input: UnlockEnvironmentCommandInput): Result<UnlockEnvironmentCommand> {
    return parseOperationInput(unlockEnvironmentCommandInputSchema, input).map(
      (parsed) => new UnlockEnvironmentCommand(parsed.environmentId),
    );
  }
}
