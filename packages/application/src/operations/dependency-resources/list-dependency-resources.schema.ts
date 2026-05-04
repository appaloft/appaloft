import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const listDependencyResourcesQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
  kind: z.enum(["postgres"]).optional(),
});

export type ListDependencyResourcesQueryInput = z.output<
  typeof listDependencyResourcesQueryInputSchema
>;
