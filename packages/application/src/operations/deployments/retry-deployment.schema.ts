import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const retryDeploymentCommandInputSchema = z
  .object({
    deploymentId: nonEmptyTrimmedString("Deployment id"),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    readinessGeneratedAt: nonEmptyTrimmedString("Readiness generated at").optional(),
  })
  .strict();

export type RetryDeploymentCommandInput = z.input<typeof retryDeploymentCommandInputSchema>;
