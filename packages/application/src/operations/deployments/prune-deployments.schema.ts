import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const pruneDeploymentsCommandInputSchema = z.object({
  before: z.string().datetime(),
  deploymentId: nonEmptyTrimmedString("Deployment id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  dryRun: z.boolean().default(true),
});

export type PruneDeploymentsCommandInput = z.input<typeof pruneDeploymentsCommandInputSchema>;
export type PruneDeploymentsCommandPayload = z.output<typeof pruneDeploymentsCommandInputSchema>;

export const pruneDeploymentsResponseSchema = z.object({
  schemaVersion: z.literal("deployments.prune/v1"),
  before: z.string().datetime(),
  deploymentId: z.string().optional(),
  resourceId: z.string().optional(),
  serverId: z.string().optional(),
  dryRun: z.boolean(),
  matchedCount: z.number().int().nonnegative(),
  prunedCount: z.number().int().nonnegative(),
  guardedCount: z.number().int().nonnegative(),
  affectedDeploymentIds: z.array(z.string()),
  guardedDeploymentIds: z.array(z.string()),
  prunedAt: z.string().datetime(),
});

export type PruneDeploymentsResponse = z.infer<typeof pruneDeploymentsResponseSchema>;
