import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showResourceDependencyBindingQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  bindingId: nonEmptyTrimmedString("Resource dependency binding id"),
});

export type ShowResourceDependencyBindingQueryInput = z.output<
  typeof showResourceDependencyBindingQueryInputSchema
>;
