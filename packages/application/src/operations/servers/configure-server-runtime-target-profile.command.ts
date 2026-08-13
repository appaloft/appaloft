import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureServerRuntimeTargetProfileCommandInput,
  type ConfigureServerRuntimeTargetProfileCommandPayload,
  type ConfigureServerRuntimeTargetProfileResult,
  configureServerRuntimeTargetProfileCommandInputSchema,
} from "./configure-server-runtime-target-profile.schema";

export {
  type ConfigureServerRuntimeTargetProfileCommandInput,
  type ConfigureServerRuntimeTargetProfileCommandPayload,
  type ConfigureServerRuntimeTargetProfileResult,
  configureServerRuntimeTargetProfileCommandInputSchema,
  configureServerRuntimeTargetProfileResultSchema,
  runtimeTargetProfileReferenceSchema,
  runtimeTargetProfileSnapshotSchema,
} from "./configure-server-runtime-target-profile.schema";

export class ConfigureServerRuntimeTargetProfileCommand extends Command<ConfigureServerRuntimeTargetProfileResult> {
  constructor(public readonly input: ConfigureServerRuntimeTargetProfileCommandPayload) {
    super();
  }

  static create(
    input: ConfigureServerRuntimeTargetProfileCommandInput,
  ): Result<ConfigureServerRuntimeTargetProfileCommand> {
    return parseOperationInput(configureServerRuntimeTargetProfileCommandInputSchema, input, {
      validationPhase: "command-validation",
    }).map((parsed) => new ConfigureServerRuntimeTargetProfileCommand(parsed));
  }
}
