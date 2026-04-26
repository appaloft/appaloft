import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureResourceAccessCommandInput,
  type ConfigureResourceAccessCommandPayload,
  configureResourceAccessCommandInputSchema,
} from "./configure-resource-access.schema";

export {
  type ConfigureResourceAccessCommandInput,
  configureResourceAccessCommandInputSchema,
} from "./configure-resource-access.schema";

export class ConfigureResourceAccessCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly accessProfile: ConfigureResourceAccessCommandPayload["accessProfile"],
  ) {
    super();
  }

  static create(
    input: ConfigureResourceAccessCommandInput,
  ): Result<ConfigureResourceAccessCommand> {
    return parseOperationInput(configureResourceAccessCommandInputSchema, input).map(
      (parsed) => new ConfigureResourceAccessCommand(parsed.resourceId, parsed.accessProfile),
    );
  }
}
