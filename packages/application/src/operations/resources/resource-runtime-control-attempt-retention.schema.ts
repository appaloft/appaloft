import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyTrimmedString = (label: string) => nonEmptyTrimmedString(label).optional();

export const pruneResourceRuntimeControlAttemptsCommandInputSchema = z.object({
  before: z.string().datetime(),
  deploymentId: optionalNonEmptyTrimmedString("Deployment id"),
  resourceId: optionalNonEmptyTrimmedString("Resource id"),
  serverId: optionalNonEmptyTrimmedString("Server id"),
  dryRun: z.boolean().default(true),
});

export type PruneResourceRuntimeControlAttemptsCommandInput = z.input<
  typeof pruneResourceRuntimeControlAttemptsCommandInputSchema
>;

export const pruneResourceRuntimeControlAttemptsResponseSchema = z.object({
  schemaVersion: z.literal("resources.runtime-control-attempts.prune/v1"),
  before: z.string().datetime(),
  deploymentId: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number().int().nonnegative(),
  prunedCount: z.number().int().nonnegative(),
  affectedResourceCount: z.number().int().nonnegative(),
  affectedDeploymentCount: z.number().int().nonnegative(),
  prunedAt: z.string().datetime(),
});

export type PruneResourceRuntimeControlAttemptsResponse = z.infer<
  typeof pruneResourceRuntimeControlAttemptsResponseSchema
>;
