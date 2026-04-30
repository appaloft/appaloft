import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

export const deploymentPlanQueryInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    environmentId: nonEmptyTrimmedString("Environment id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
    serverId: nonEmptyTrimmedString("Server id"),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    includeAccessPlan: booleanInput(true),
    includeCommandSpecs: booleanInput(true),
  })
  .strict();

export type DeploymentPlanQueryInput = z.input<typeof deploymentPlanQueryInputSchema>;
export type DeploymentPlanQueryParsedInput = z.output<typeof deploymentPlanQueryInputSchema>;
