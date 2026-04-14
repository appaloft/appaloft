import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const cancelDeploymentCommandInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  reason: z.string().trim().min(1).optional(),
});

export type CancelDeploymentCommandInput = z.input<typeof cancelDeploymentCommandInputSchema>;
