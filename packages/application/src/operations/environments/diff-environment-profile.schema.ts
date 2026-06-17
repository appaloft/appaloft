import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const diffEnvironmentProfileQueryInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Source environment id"),
  targetEnvironmentId: nonEmptyTrimmedString("Target environment id"),
  includeUnchanged: z.boolean().optional(),
});

export type DiffEnvironmentProfileQueryInput = z.input<
  typeof diffEnvironmentProfileQueryInputSchema
>;
