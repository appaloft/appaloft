import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const inspectDependencyResourceQueryInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
});

export type InspectDependencyResourceQueryInput = z.output<
  typeof inspectDependencyResourceQueryInputSchema
>;
