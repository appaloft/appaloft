import { z } from "zod";

import { environmentKindSchema, nonEmptyTrimmedString } from "../shared-schema";

export const promoteEnvironmentCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  targetName: nonEmptyTrimmedString("Target environment name"),
  targetKind: environmentKindSchema,
});

export type PromoteEnvironmentCommandInput = z.input<typeof promoteEnvironmentCommandInputSchema>;
