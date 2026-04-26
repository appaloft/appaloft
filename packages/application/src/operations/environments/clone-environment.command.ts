import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CloneEnvironmentCommandInput,
  type CloneEnvironmentCommandPayload,
  cloneEnvironmentCommandInputSchema,
} from "./clone-environment.schema";

export {
  type CloneEnvironmentCommandInput,
  cloneEnvironmentCommandInputSchema,
} from "./clone-environment.schema";

export class CloneEnvironmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly environmentId: string,
    public readonly targetName: string,
    public readonly targetKind?: CloneEnvironmentCommandPayload["targetKind"],
  ) {
    super();
  }

  static create(input: CloneEnvironmentCommandInput): Result<CloneEnvironmentCommand> {
    return parseOperationInput(cloneEnvironmentCommandInputSchema, input).map(
      (parsed) =>
        new CloneEnvironmentCommand(parsed.environmentId, parsed.targetName, parsed.targetKind),
    );
  }
}
