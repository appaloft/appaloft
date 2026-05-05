import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureResourceAutoDeployCommandInput,
  type ConfigureResourceAutoDeployCommandPayload,
  type ConfigureResourceAutoDeployResult,
  configureResourceAutoDeployCommandInputSchema,
} from "./configure-resource-auto-deploy.schema";

export {
  type ConfigureResourceAutoDeployCommandInput,
  type ConfigureResourceAutoDeployCommandPayload,
  type ConfigureResourceAutoDeployResult,
  configureResourceAutoDeployCommandInputSchema,
} from "./configure-resource-auto-deploy.schema";

export class ConfigureResourceAutoDeployCommand extends Command<ConfigureResourceAutoDeployResult> {
  constructor(
    public readonly resourceId: string,
    public readonly mode: ConfigureResourceAutoDeployCommandPayload["mode"],
    public readonly sourceBindingFingerprint?: string,
    public readonly policy?: ConfigureResourceAutoDeployCommandPayload["policy"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureResourceAutoDeployCommandInput,
  ): Result<ConfigureResourceAutoDeployCommand> {
    return parseOperationInput(configureResourceAutoDeployCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureResourceAutoDeployCommand(
          parsed.resourceId,
          parsed.mode,
          trimToUndefined(parsed.sourceBindingFingerprint),
          parsed.policy,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
