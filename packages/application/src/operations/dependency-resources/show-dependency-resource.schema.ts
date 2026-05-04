import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showDependencyResourceQueryInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
});

export type ShowDependencyResourceQueryInput = z.output<
  typeof showDependencyResourceQueryInputSchema
>;
