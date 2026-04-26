import { z } from "zod";

import { environmentKindSchema, nonEmptyTrimmedString } from "../shared-schema";

export const cloneEnvironmentCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  targetName: nonEmptyTrimmedString("Target environment name"),
  targetKind: environmentKindSchema.optional(),
});

export type CloneEnvironmentCommandInput = z.input<typeof cloneEnvironmentCommandInputSchema>;
export type CloneEnvironmentCommandPayload = z.output<typeof cloneEnvironmentCommandInputSchema>;
