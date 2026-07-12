import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";
export const deploymentProofQueryInputSchema = z.object({
  deploymentId: nonEmptyTrimmedString("Deployment id"),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});
export type DeploymentProofQueryInput = z.input<typeof deploymentProofQueryInputSchema>;
