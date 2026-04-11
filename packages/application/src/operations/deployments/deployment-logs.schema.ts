import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deploymentLogsQueryInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
});

export type DeploymentLogsQueryInput = z.input<typeof deploymentLogsQueryInputSchema>;
