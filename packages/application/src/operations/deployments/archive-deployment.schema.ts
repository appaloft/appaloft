import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const archiveDeploymentCommandInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  confirm: nonEmptyTrimmedString("Deployment archive confirmation"),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});

export type ArchiveDeploymentCommandInput = z.input<typeof archiveDeploymentCommandInputSchema>;
export type ArchiveDeploymentCommandPayload = z.output<typeof archiveDeploymentCommandInputSchema>;

export const archiveDeploymentResponseSchema = z.object({
  id: z.string(),
  archivedAt: z.string().datetime(),
});

export type ArchiveDeploymentResponse = z.infer<typeof archiveDeploymentResponseSchema>;
