import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const resourceEffectiveConfigQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
});

export type ResourceEffectiveConfigQueryInput = z.output<
  typeof resourceEffectiveConfigQueryInputSchema
>;
