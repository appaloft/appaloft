import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const listDependencyResourceBackupsQueryInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
  status: z.enum(["pending", "ready", "failed"]).optional(),
});

export type ListDependencyResourceBackupsQueryInput = z.output<
  typeof listDependencyResourceBackupsQueryInputSchema
>;
