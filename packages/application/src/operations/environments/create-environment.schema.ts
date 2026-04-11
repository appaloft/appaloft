import { z } from "zod";

import { environmentKindSchema, nonEmptyTrimmedString } from "../shared-schema";

export const createEnvironmentCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  name: nonEmptyTrimmedString("Environment name"),
  kind: environmentKindSchema,
  parentEnvironmentId: z.string().optional(),
});

export type CreateEnvironmentCommandInput = z.input<typeof createEnvironmentCommandInputSchema>;
