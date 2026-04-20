import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureResourceSourceCommandInput,
  type ConfigureResourceSourceCommandPayload,
  configureResourceSourceCommandInputSchema,
} from "./configure-resource-source.schema";

export {
  type ConfigureResourceSourceCommandInput,
  configureResourceSourceCommandInputSchema,
} from "./configure-resource-source.schema";

export class ConfigureResourceSourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly source: ConfigureResourceSourceCommandPayload["source"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureResourceSourceCommandInput,
  ): Result<ConfigureResourceSourceCommand> {
    return parseOperationInput(configureResourceSourceCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureResourceSourceCommand(
          parsed.resourceId,
          parsed.source,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
