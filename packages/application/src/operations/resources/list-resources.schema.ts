import { z } from "zod";

import { booleanQueryParamSchema, listLimitSchema } from "../shared-schema";

export const listResourcesQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  includePreviewResources: booleanQueryParamSchema.optional(),
  limit: listLimitSchema,
});

export type ListResourcesQueryInput = z.input<typeof listResourcesQueryInputSchema>;
