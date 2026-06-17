import { z } from "zod";

import { booleanQueryParamSchema, nonEmptyTrimmedString } from "../shared-schema";

export const diffEnvironmentProfileQueryInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Source environment id"),
  targetEnvironmentId: nonEmptyTrimmedString("Target environment id"),
  includeUnchanged: booleanQueryParamSchema.optional(),
});

export type DiffEnvironmentProfileQueryInput = z.input<
  typeof diffEnvironmentProfileQueryInputSchema
>;
