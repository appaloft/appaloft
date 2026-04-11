import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const rollbackDeploymentCommandInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
});

export type RollbackDeploymentCommandInput = z.input<typeof rollbackDeploymentCommandInputSchema>;
