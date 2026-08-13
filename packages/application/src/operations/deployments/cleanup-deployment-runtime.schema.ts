import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const cleanupDeploymentRuntimeCommandInputSchema = z
  .object({
    deploymentId: nonEmptyTrimmedString("Deployment id"),
    confirm: nonEmptyTrimmedString("Deployment cleanup confirmation"),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
  })
  .strict();

export const cleanupDeploymentRuntimeResponseSchema = z
  .object({
    id: nonEmptyTrimmedString("Deployment id"),
    runtimeCleaned: z.literal(true),
  })
  .strict();

export type CleanupDeploymentRuntimeCommandInput = z.input<
  typeof cleanupDeploymentRuntimeCommandInputSchema
>;
export type CleanupDeploymentRuntimeCommandPayload = z.output<
  typeof cleanupDeploymentRuntimeCommandInputSchema
>;
export type CleanupDeploymentRuntimeResponse = z.output<
  typeof cleanupDeploymentRuntimeResponseSchema
>;
