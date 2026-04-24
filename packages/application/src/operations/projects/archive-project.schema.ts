import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const archiveProjectCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  reason: nonEmptyTrimmedString("Archive reason").max(280).optional(),
});

export type ArchiveProjectCommandInput = z.input<typeof archiveProjectCommandInputSchema>;
export type ArchiveProjectCommandPayload = z.output<typeof archiveProjectCommandInputSchema>;
