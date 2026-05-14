import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const configureDependencyResourceBackupPolicyCommandInputSchema = z.object({
  policyId: optionalNonEmptyString,
  version: optionalNonEmptyString.default("v1"),
  dependencyResourceId: z.string().trim().min(1),
  retentionDays: z.number().int().min(1),
  scheduleIntervalHours: z.number().int().min(1),
  providerKey: optionalNonEmptyString,
  retryOnFailure: z.boolean().default(true),
  enabled: z.boolean().default(true),
  nextRunAt: optionalNonEmptyString,
});

export type ConfigureDependencyResourceBackupPolicyCommandInput = z.input<
  typeof configureDependencyResourceBackupPolicyCommandInputSchema
>;
export type ConfigureDependencyResourceBackupPolicyCommandPayload = z.output<
  typeof configureDependencyResourceBackupPolicyCommandInputSchema
>;

export class ConfigureDependencyResourceBackupPolicyCommand extends Command<{ id: string }> {
  constructor(public readonly input: ConfigureDependencyResourceBackupPolicyCommandPayload) {
    super();
  }

  static create(
    input: ConfigureDependencyResourceBackupPolicyCommandInput,
  ): Result<ConfigureDependencyResourceBackupPolicyCommand> {
    return parseOperationInput(
      configureDependencyResourceBackupPolicyCommandInputSchema,
      input,
    ).map((parsed) => new ConfigureDependencyResourceBackupPolicyCommand(parsed));
  }
}
