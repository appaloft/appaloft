import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { runtimeTargetPruneCategorySchema } from "./prune-server-capacity.schema";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const scheduledRuntimePrunePolicyScopeSchema = z.enum([
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "deployment-snapshot",
]);

export function deploymentSnapshotRuntimePrunePolicyId(serverId: string): string {
  return `rpp_deployment_snapshot_${serverId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export const configureScheduledRuntimePrunePolicyCommandInputSchema = z.object({
  policyId: optionalNonEmptyString,
  version: optionalNonEmptyString.default("v1"),
  scope: scheduledRuntimePrunePolicyScopeSchema,
  serverId: z.string().trim().min(1).default("*"),
  retentionDays: z.number().int().min(1),
  destructive: z.boolean().default(false),
  categories: z.array(runtimeTargetPruneCategorySchema).min(1).default(["stopped-containers"]),
  retryOnFailure: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type ConfigureScheduledRuntimePrunePolicyCommandInput = z.input<
  typeof configureScheduledRuntimePrunePolicyCommandInputSchema
>;
export type ConfigureScheduledRuntimePrunePolicyCommandPayload = z.output<
  typeof configureScheduledRuntimePrunePolicyCommandInputSchema
>;

export class ConfigureScheduledRuntimePrunePolicyCommand extends Command<{ id: string }> {
  constructor(public readonly input: ConfigureScheduledRuntimePrunePolicyCommandPayload) {
    super();
  }

  static create(
    input: ConfigureScheduledRuntimePrunePolicyCommandInput,
  ): Result<ConfigureScheduledRuntimePrunePolicyCommand> {
    return parseOperationInput(configureScheduledRuntimePrunePolicyCommandInputSchema, input).map(
      (parsed) => new ConfigureScheduledRuntimePrunePolicyCommand(parsed),
    );
  }
}
