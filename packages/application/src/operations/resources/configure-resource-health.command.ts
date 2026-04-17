import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureResourceHealthCommandInput,
  type ConfigureResourceHealthCommandPayload,
  configureResourceHealthCommandInputSchema,
} from "./configure-resource-health.schema";

export {
  type ConfigureResourceHealthCommandInput,
  configureResourceHealthCommandInputSchema,
} from "./configure-resource-health.schema";

export class ConfigureResourceHealthCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly healthCheck: ConfigureResourceHealthCommandPayload["healthCheck"],
  ) {
    super();
  }

  static create(
    input: ConfigureResourceHealthCommandInput,
  ): Result<ConfigureResourceHealthCommand> {
    return parseOperationInput(configureResourceHealthCommandInputSchema, input).map(
      (parsed) => new ConfigureResourceHealthCommand(parsed.resourceId, parsed.healthCheck),
    );
  }
}
