import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const queryDependencyResourceQueryInputSchema = z.object({
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
  statement: nonEmptyTrimmedString("Safe query statement"),
  maxRows: z.coerce.number().int().min(1).max(500).default(100),
  timeoutMs: z.coerce.number().int().min(100).max(30_000).default(5_000),
});

export type QueryDependencyResourceQueryInput = z.input<
  typeof queryDependencyResourceQueryInputSchema
>;
