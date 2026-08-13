import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureResourceRolloutCommandInput,
  type ConfigureResourceRolloutCommandPayload,
  configureResourceRolloutCommandInputSchema,
} from "./configure-resource-rollout.schema";

export {
  type ConfigureResourceRolloutCommandInput,
  configureResourceRolloutCommandInputSchema,
} from "./configure-resource-rollout.schema";

export class ConfigureResourceRolloutCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly rolloutProfile: ConfigureResourceRolloutCommandPayload["rolloutProfile"],
  ) {
    super();
  }

  static create(
    input: ConfigureResourceRolloutCommandInput,
  ): Result<ConfigureResourceRolloutCommand> {
    return parseOperationInput(configureResourceRolloutCommandInputSchema, input).map(
      (parsed) => new ConfigureResourceRolloutCommand(parsed.resourceId, parsed.rolloutProfile),
    );
  }
}
