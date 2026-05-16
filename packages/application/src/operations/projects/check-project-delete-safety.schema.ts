import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const checkProjectDeleteSafetyQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
});

export type CheckProjectDeleteSafetyQueryInput = z.input<
  typeof checkProjectDeleteSafetyQueryInputSchema
>;
