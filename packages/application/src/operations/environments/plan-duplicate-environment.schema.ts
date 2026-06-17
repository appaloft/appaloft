import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const planDuplicateEnvironmentQueryInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Source environment id"),
  targetName: nonEmptyTrimmedString("Target environment name"),
  targetProjectId: nonEmptyTrimmedString("Target project id").optional(),
  targetEnvironmentId: nonEmptyTrimmedString("Target environment id").optional(),
});

export type PlanDuplicateEnvironmentQueryInput = z.input<
  typeof planDuplicateEnvironmentQueryInputSchema
>;
