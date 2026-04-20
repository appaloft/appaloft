import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureResourceNetworkCommandInput,
  type ConfigureResourceNetworkCommandPayload,
  configureResourceNetworkCommandInputSchema,
} from "./configure-resource-network.schema";

export {
  type ConfigureResourceNetworkCommandInput,
  configureResourceNetworkCommandInputSchema,
} from "./configure-resource-network.schema";

export class ConfigureResourceNetworkCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly networkProfile: ConfigureResourceNetworkCommandPayload["networkProfile"],
  ) {
    super();
  }

  static create(
    input: ConfigureResourceNetworkCommandInput,
  ): Result<ConfigureResourceNetworkCommand> {
    return parseOperationInput(configureResourceNetworkCommandInputSchema, input).map(
      (parsed) => new ConfigureResourceNetworkCommand(parsed.resourceId, parsed.networkProfile),
    );
  }
}
