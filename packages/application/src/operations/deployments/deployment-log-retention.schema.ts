import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const pruneDeploymentLogsCommandInputSchema = z.object({
  before: z.string().datetime(),
  deploymentId: nonEmptyTrimmedString("Deployment id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  dryRun: z.boolean().default(true),
});

export type PruneDeploymentLogsCommandInput = z.input<typeof pruneDeploymentLogsCommandInputSchema>;
