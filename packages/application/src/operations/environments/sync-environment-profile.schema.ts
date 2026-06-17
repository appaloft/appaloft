import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const syncEnvironmentProfileCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Source environment id"),
  targetEnvironmentId: nonEmptyTrimmedString("Target environment id"),
  resourceIds: z.array(nonEmptyTrimmedString("Source resource id")).min(1),
});

export type SyncEnvironmentProfileCommandInput = z.input<
  typeof syncEnvironmentProfileCommandInputSchema
>;
export type SyncEnvironmentProfileCommandPayload = z.output<
  typeof syncEnvironmentProfileCommandInputSchema
>;
