import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureResourceScaleCommandInput,
  type ConfigureResourceScaleCommandPayload,
  configureResourceScaleCommandInputSchema,
} from "./configure-resource-scale.schema";

export {
  type ConfigureResourceScaleCommandInput,
  configureResourceScaleCommandInputSchema,
} from "./configure-resource-scale.schema";

export class ConfigureResourceScaleCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly scaleProfile: ConfigureResourceScaleCommandPayload["scaleProfile"],
  ) {
    super();
  }

  static create(input: ConfigureResourceScaleCommandInput): Result<ConfigureResourceScaleCommand> {
    return parseOperationInput(configureResourceScaleCommandInputSchema, input).map(
      (parsed) => new ConfigureResourceScaleCommand(parsed.resourceId, parsed.scaleProfile),
    );
  }
}
