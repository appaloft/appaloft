import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const checkDeploymentHealthCommandInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
});

export type CheckDeploymentHealthCommandInput = z.input<
  typeof checkDeploymentHealthCommandInputSchema
>;
