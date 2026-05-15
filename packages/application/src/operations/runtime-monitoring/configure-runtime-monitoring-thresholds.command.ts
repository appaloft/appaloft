import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type RuntimeMonitoringThresholdPolicyRead } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureRuntimeMonitoringThresholdsCommandInput,
  type ConfigureRuntimeMonitoringThresholdsCommandPayload,
  configureRuntimeMonitoringThresholdsCommandInputSchema,
} from "./runtime-monitoring.schema";

export {
  type ConfigureRuntimeMonitoringThresholdsCommandInput,
  type ConfigureRuntimeMonitoringThresholdsCommandPayload,
  configureRuntimeMonitoringThresholdsCommandInputSchema,
} from "./runtime-monitoring.schema";

export interface ConfigureRuntimeMonitoringThresholdsResult {
  policy: RuntimeMonitoringThresholdPolicyRead;
}

export class ConfigureRuntimeMonitoringThresholdsCommand extends Command<ConfigureRuntimeMonitoringThresholdsResult> {
  constructor(public readonly input: ConfigureRuntimeMonitoringThresholdsCommandPayload) {
    super();
  }

  static create(
    input: ConfigureRuntimeMonitoringThresholdsCommandInput,
  ): Result<ConfigureRuntimeMonitoringThresholdsCommand> {
    return parseOperationInput(configureRuntimeMonitoringThresholdsCommandInputSchema, input).map(
      (parsed) => new ConfigureRuntimeMonitoringThresholdsCommand(parsed),
    );
  }
}
