import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";
import { deploymentStaleAfterSecondsSchema } from "./list-stale-deployment-attempts.schema";

export const reconcileStaleDeploymentCommandInputSchema = z
  .object({
    deploymentId: nonEmptyTrimmedString("Deployment id"),
    confirm: nonEmptyTrimmedString("Confirmation deployment id"),
    stateVersion: nonEmptyTrimmedString("State version"),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    staleAfterSeconds: deploymentStaleAfterSecondsSchema,
  })
  .strict();

export type ReconcileStaleDeploymentCommandInput = z.input<
  typeof reconcileStaleDeploymentCommandInputSchema
>;
export type ReconcileStaleDeploymentCommandPayload = z.output<
  typeof reconcileStaleDeploymentCommandInputSchema
>;
