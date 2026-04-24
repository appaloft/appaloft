import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type environmentVariableExposureSchema, parseOperationInput } from "../shared-schema";
import {
  type UnsetResourceVariableCommandInput,
  unsetResourceVariableCommandInputSchema,
} from "./unset-resource-variable.schema";

export { type UnsetResourceVariableCommandInput, unsetResourceVariableCommandInputSchema };

export class UnsetResourceVariableCommand extends Command<null> {
  constructor(
    public readonly resourceId: string,
    public readonly key: string,
    public readonly exposure: (typeof environmentVariableExposureSchema)["_output"],
  ) {
    super();
  }

  static create(input: UnsetResourceVariableCommandInput): Result<UnsetResourceVariableCommand> {
    return parseOperationInput(unsetResourceVariableCommandInputSchema, input).map(
      (parsed) => new UnsetResourceVariableCommand(parsed.resourceId, parsed.key, parsed.exposure),
    );
  }
}
