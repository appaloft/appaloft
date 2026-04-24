import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import {
  type environmentVariableExposureSchema,
  type environmentVariableKindSchema,
  parseOperationInput,
} from "../shared-schema";
import {
  type SetResourceVariableCommandInput,
  setResourceVariableCommandInputSchema,
} from "./set-resource-variable.schema";

export { type SetResourceVariableCommandInput, setResourceVariableCommandInputSchema };

export class SetResourceVariableCommand extends Command<null> {
  constructor(
    public readonly resourceId: string,
    public readonly key: string,
    public readonly value: string,
    public readonly kind: (typeof environmentVariableKindSchema)["_output"],
    public readonly exposure: (typeof environmentVariableExposureSchema)["_output"],
    public readonly isSecret?: boolean,
  ) {
    super();
  }

  static create(input: SetResourceVariableCommandInput): Result<SetResourceVariableCommand> {
    return parseOperationInput(setResourceVariableCommandInputSchema, input).map(
      (parsed) =>
        new SetResourceVariableCommand(
          parsed.resourceId,
          parsed.key,
          parsed.value,
          parsed.kind,
          parsed.exposure,
          parsed.isSecret,
        ),
    );
  }
}
