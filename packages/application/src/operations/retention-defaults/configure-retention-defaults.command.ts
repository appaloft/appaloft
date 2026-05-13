import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureRetentionDefaultsCommandInput,
  type ConfigureRetentionDefaultsCommandPayload,
  configureRetentionDefaultsCommandInputSchema,
} from "./retention-defaults.schema";

export {
  type ConfigureRetentionDefaultsCommandInput,
  type ConfigureRetentionDefaultsCommandPayload,
  configureRetentionDefaultsCommandInputSchema,
} from "./retention-defaults.schema";

export class ConfigureRetentionDefaultsCommand extends Command<{ id: string }> {
  constructor(public readonly input: ConfigureRetentionDefaultsCommandPayload) {
    super();
  }

  static create(
    input: ConfigureRetentionDefaultsCommandInput,
  ): Result<ConfigureRetentionDefaultsCommand> {
    return parseOperationInput(configureRetentionDefaultsCommandInputSchema, input).map(
      (parsed) => new ConfigureRetentionDefaultsCommand(parsed),
    );
  }
}
