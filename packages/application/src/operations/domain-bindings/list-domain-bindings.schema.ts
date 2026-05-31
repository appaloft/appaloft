import { z } from "zod";

import { listLimitSchema } from "../shared-schema";

export const listDomainBindingsQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  resourceId: z.string().optional(),
  limit: listLimitSchema,
});

export type ListDomainBindingsQueryInput = z.input<typeof listDomainBindingsQueryInputSchema>;
