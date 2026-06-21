import { z } from "zod";

import { booleanQueryParamSchema, listLimitSchema } from "../shared-schema";

export const resourceListLifecycleStatusSchema = z
  .enum(["active", "archived", "all"])
  .default("active");
export type ResourceListLifecycleStatus = z.infer<typeof resourceListLifecycleStatusSchema>;

export const listResourcesQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  includePreviewResources: booleanQueryParamSchema.optional(),
  lifecycleStatus: resourceListLifecycleStatusSchema,
  limit: listLimitSchema,
});

export type ListResourcesQueryInput = z.input<typeof listResourcesQueryInputSchema>;
