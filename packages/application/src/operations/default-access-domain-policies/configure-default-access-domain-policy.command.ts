import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureDefaultAccessDomainPolicyCommandInput,
  type ConfigureDefaultAccessDomainPolicyCommandPayload,
  configureDefaultAccessDomainPolicyCommandInputSchema,
} from "./configure-default-access-domain-policy.schema";

export {
  type ConfigureDefaultAccessDomainPolicyCommandInput,
  configureDefaultAccessDomainPolicyCommandInputSchema,
} from "./configure-default-access-domain-policy.schema";

export class ConfigureDefaultAccessDomainPolicyCommand extends Command<{ id: string }> {
  constructor(
    public readonly scope: ConfigureDefaultAccessDomainPolicyCommandPayload["scope"],
    public readonly mode: ConfigureDefaultAccessDomainPolicyCommandPayload["mode"],
    public readonly providerKey?: string,
    public readonly templateRef?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureDefaultAccessDomainPolicyCommandInput,
  ): Result<ConfigureDefaultAccessDomainPolicyCommand> {
    return parseOperationInput(configureDefaultAccessDomainPolicyCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureDefaultAccessDomainPolicyCommand(
          parsed.scope,
          parsed.mode,
          parsed.providerKey,
          parsed.templateRef,
          parsed.idempotencyKey,
        ),
    );
  }
}
