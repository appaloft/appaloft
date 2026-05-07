import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const rollbackDeploymentCommandInputSchema = z
  .object({
    deploymentId: nonEmptyTrimmedString("Deployment id"),
    rollbackCandidateDeploymentId: nonEmptyTrimmedString("Rollback candidate deployment id"),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    readinessGeneratedAt: nonEmptyTrimmedString("Readiness generated at").optional(),
  })
  .strict();

export type RollbackDeploymentCommandInput = z.input<typeof rollbackDeploymentCommandInputSchema>;
