import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ConfigurePreviewPolicyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigurePreviewPolicyCommandInput,
  type ConfigurePreviewPolicyCommandPayload,
  configurePreviewPolicyCommandInputSchema,
} from "./configure-preview-policy.schema";

export {
  type ConfigurePreviewPolicyCommandInput,
  configurePreviewPolicyCommandInputSchema,
} from "./configure-preview-policy.schema";

export class ConfigurePreviewPolicyCommand extends Command<ConfigurePreviewPolicyResult> {
  constructor(
    public readonly scope: ConfigurePreviewPolicyCommandPayload["scope"],
    public readonly policy: ConfigurePreviewPolicyCommandPayload["policy"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: ConfigurePreviewPolicyCommandInput): Result<ConfigurePreviewPolicyCommand> {
    return parseOperationInput(configurePreviewPolicyCommandInputSchema, input).map(
      (parsed) =>
        new ConfigurePreviewPolicyCommand(parsed.scope, parsed.policy, parsed.idempotencyKey),
    );
  }
}
