import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const cancelDeploymentCommandInputSchema = z
  .object({
    deploymentId: nonEmptyTrimmedString("Deployment id"),
    confirm: nonEmptyTrimmedString("Confirmation deployment id"),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
  })
  .strict();

export type CancelDeploymentCommandInput = z.input<typeof cancelDeploymentCommandInputSchema>;
export type CancelDeploymentCommandPayload = z.output<typeof cancelDeploymentCommandInputSchema>;
