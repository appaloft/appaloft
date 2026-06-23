import { z } from "zod";

import { booleanQueryParam, listLimitSchema } from "../shared-schema";

export const listDeploymentsQueryInputSchema = z.object({
  projectId: z.string().optional(),
  resourceId: z.string().optional(),
  includeArchived: booleanQueryParam(false),
  activeResourcesOnly: booleanQueryParam(false),
  limit: listLimitSchema,
});

export type ListDeploymentsQueryInput = z.input<typeof listDeploymentsQueryInputSchema>;
