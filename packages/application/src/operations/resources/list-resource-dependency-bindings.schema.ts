import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const listResourceDependencyBindingsQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
});

export type ListResourceDependencyBindingsQueryInput = z.output<
  typeof listResourceDependencyBindingsQueryInputSchema
>;
