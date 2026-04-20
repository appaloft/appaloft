import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureResourceRuntimeCommandInput,
  type ConfigureResourceRuntimeCommandPayload,
  configureResourceRuntimeCommandInputSchema,
} from "./configure-resource-runtime.schema";

export {
  type ConfigureResourceRuntimeCommandInput,
  configureResourceRuntimeCommandInputSchema,
} from "./configure-resource-runtime.schema";

export class ConfigureResourceRuntimeCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly runtimeProfile: ConfigureResourceRuntimeCommandPayload["runtimeProfile"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureResourceRuntimeCommandInput,
  ): Result<ConfigureResourceRuntimeCommand> {
    return parseOperationInput(configureResourceRuntimeCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureResourceRuntimeCommand(
          parsed.resourceId,
          parsed.runtimeProfile,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
