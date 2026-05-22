import { z } from "zod";

import { listLimitSchema } from "../shared-schema";

export const listResourcesQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  includePreviewResources: z.boolean().optional(),
  limit: listLimitSchema,
});

export type ListResourcesQueryInput = z.input<typeof listResourcesQueryInputSchema>;
