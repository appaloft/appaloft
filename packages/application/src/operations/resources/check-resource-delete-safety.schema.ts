import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const checkResourceDeleteSafetyQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
});

export type CheckResourceDeleteSafetyQueryInput = z.input<
  typeof checkResourceDeleteSafetyQueryInputSchema
>;
