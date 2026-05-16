import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const setProjectDescriptionCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  description: z.string().optional(),
});

export type SetProjectDescriptionCommandInput = z.input<
  typeof setProjectDescriptionCommandInputSchema
>;
