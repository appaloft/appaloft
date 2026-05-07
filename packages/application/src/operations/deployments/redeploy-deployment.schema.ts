import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const redeployDeploymentCommandInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    projectId: nonEmptyTrimmedString("Project id").optional(),
    environmentId: nonEmptyTrimmedString("Environment id").optional(),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    sourceDeploymentId: nonEmptyTrimmedString("Source deployment id").optional(),
    readinessGeneratedAt: nonEmptyTrimmedString("Readiness generated at").optional(),
  })
  .strict();

export type RedeployDeploymentCommandInput = z.input<typeof redeployDeploymentCommandInputSchema>;
