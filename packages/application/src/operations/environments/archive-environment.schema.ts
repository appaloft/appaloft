import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const archiveEnvironmentCommandInputSchema = z.object({
  environmentId: nonEmptyTrimmedString("Environment id"),
  reason: nonEmptyTrimmedString("Archive reason").max(280).optional(),
});

export type ArchiveEnvironmentCommandInput = z.input<typeof archiveEnvironmentCommandInputSchema>;
export type ArchiveEnvironmentCommandPayload = z.output<
  typeof archiveEnvironmentCommandInputSchema
>;
