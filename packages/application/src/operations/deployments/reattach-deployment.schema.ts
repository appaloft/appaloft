import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const reattachDeploymentCommandInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
});

export type ReattachDeploymentCommandInput = z.input<typeof reattachDeploymentCommandInputSchema>;
