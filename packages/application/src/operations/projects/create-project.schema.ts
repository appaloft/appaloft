import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createProjectCommandInputSchema = z.object({
  name: nonEmptyTrimmedString("Project name"),
  description: z.string().optional(),
});

export type CreateProjectCommandInput = z.input<typeof createProjectCommandInputSchema>;
