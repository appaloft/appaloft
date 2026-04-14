import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createDeploymentCommandInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    serverId: nonEmptyTrimmedString("Server id"),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    environmentId: nonEmptyTrimmedString("Environment id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
  })
  .strict();

export type CreateDeploymentCommandInput = z.input<typeof createDeploymentCommandInputSchema>;
