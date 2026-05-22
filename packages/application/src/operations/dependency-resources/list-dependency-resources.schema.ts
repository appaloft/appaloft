import { z } from "zod";

import { listLimitSchema, nonEmptyTrimmedString } from "../shared-schema";

export const listDependencyResourcesQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
  kind: z.enum(["postgres", "redis"]).optional(),
  limit: listLimitSchema,
});

export type ListDependencyResourcesQueryInput = z.output<
  typeof listDependencyResourcesQueryInputSchema
>;
