import { z } from "zod";

import { listLimitSchema } from "../shared-schema";

export const listEnvironmentsQueryInputSchema = z.object({
  projectId: z.string().optional(),
  limit: listLimitSchema,
});

export type ListEnvironmentsQueryInput = z.input<typeof listEnvironmentsQueryInputSchema>;
