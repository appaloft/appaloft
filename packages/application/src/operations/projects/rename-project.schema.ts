import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const renameProjectCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  name: nonEmptyTrimmedString("Project name"),
});

export type RenameProjectCommandInput = z.input<typeof renameProjectCommandInputSchema>;
