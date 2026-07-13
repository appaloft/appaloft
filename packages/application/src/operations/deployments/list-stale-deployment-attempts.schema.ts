import { z } from "zod";
import { listLimitSchema, nonEmptyTrimmedString } from "../shared-schema";
import {
  defaultDeploymentStaleAfterSeconds,
  maximumDeploymentStaleAfterSeconds,
  minimumDeploymentStaleAfterSeconds,
} from "./deployment-stale-attempt.policy";

export const deploymentStaleAfterSecondsSchema = z.coerce
  .number()
  .int()
  .min(minimumDeploymentStaleAfterSeconds)
  .max(maximumDeploymentStaleAfterSeconds)
  .default(defaultDeploymentStaleAfterSeconds);

export const listStaleDeploymentAttemptsQueryInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id").optional(),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    staleAfterSeconds: deploymentStaleAfterSecondsSchema,
    limit: listLimitSchema,
  })
  .strict();

export type ListStaleDeploymentAttemptsQueryInput = z.input<
  typeof listStaleDeploymentAttemptsQueryInputSchema
>;
