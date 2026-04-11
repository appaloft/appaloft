import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import {
  type environmentVariableExposureSchema,
  type environmentVariableScopeSchema,
  parseOperationInput,
} from "../shared-schema";
import {
  type UnsetEnvironmentVariableCommandInput,
  unsetEnvironmentVariableCommandInputSchema,
} from "./unset-environment-variable.schema";

export {
  type UnsetEnvironmentVariableCommandInput,
  unsetEnvironmentVariableCommandInputSchema,
} from "./unset-environment-variable.schema";

export class UnsetEnvironmentVariableCommand extends Command<null> {
  constructor(
    public readonly environmentId: string,
    public readonly key: string,
    public readonly exposure: (typeof environmentVariableExposureSchema)["_output"],
    public readonly scope?: (typeof environmentVariableScopeSchema)["_output"],
  ) {
    super();
  }

  static create(
    input: UnsetEnvironmentVariableCommandInput,
  ): Result<UnsetEnvironmentVariableCommand> {
    return parseOperationInput(unsetEnvironmentVariableCommandInputSchema, input).map(
      (parsed) =>
        new UnsetEnvironmentVariableCommand(
          parsed.environmentId,
          parsed.key,
          parsed.exposure,
          parsed.scope,
        ),
    );
  }
}
