import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { type environmentKindSchema, parseOperationInput } from "../shared-schema";
import {
  type PromoteEnvironmentCommandInput,
  promoteEnvironmentCommandInputSchema,
} from "./promote-environment.schema";

export {
  type PromoteEnvironmentCommandInput,
  promoteEnvironmentCommandInputSchema,
} from "./promote-environment.schema";

export class PromoteEnvironmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly environmentId: string,
    public readonly targetName: string,
    public readonly targetKind: (typeof environmentKindSchema)["_output"],
  ) {
    super();
  }

  static create(input: PromoteEnvironmentCommandInput): Result<PromoteEnvironmentCommand> {
    return parseOperationInput(promoteEnvironmentCommandInputSchema, input).map(
      (parsed) =>
        new PromoteEnvironmentCommand(parsed.environmentId, parsed.targetName, parsed.targetKind),
    );
  }
}
