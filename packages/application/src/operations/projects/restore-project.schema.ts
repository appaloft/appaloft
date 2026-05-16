import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const restoreProjectCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
});

export type RestoreProjectCommandInput = z.input<typeof restoreProjectCommandInputSchema>;
