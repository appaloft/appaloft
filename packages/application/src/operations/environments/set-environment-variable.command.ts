import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import {
  type environmentVariableExposureSchema,
  type environmentVariableKindSchema,
  type environmentVariableScopeSchema,
  parseOperationInput,
} from "../shared-schema";
import {
  type SetEnvironmentVariableCommandInput,
  setEnvironmentVariableCommandInputSchema,
} from "./set-environment-variable.schema";

export {
  type SetEnvironmentVariableCommandInput,
  setEnvironmentVariableCommandInputSchema,
} from "./set-environment-variable.schema";

export class SetEnvironmentVariableCommand extends Command<null> {
  constructor(
    public readonly environmentId: string,
    public readonly key: string,
    public readonly value: string,
    public readonly kind: (typeof environmentVariableKindSchema)["_output"],
    public readonly exposure: (typeof environmentVariableExposureSchema)["_output"],
    public readonly scope?: (typeof environmentVariableScopeSchema)["_output"],
    public readonly isSecret?: boolean,
  ) {
    super();
  }

  static create(input: SetEnvironmentVariableCommandInput): Result<SetEnvironmentVariableCommand> {
    return parseOperationInput(setEnvironmentVariableCommandInputSchema, input).map(
      (parsed) =>
        new SetEnvironmentVariableCommand(
          parsed.environmentId,
          parsed.key,
          parsed.value,
          parsed.kind,
          parsed.exposure,
          parsed.scope,
          parsed.isSecret,
        ),
    );
  }
}
