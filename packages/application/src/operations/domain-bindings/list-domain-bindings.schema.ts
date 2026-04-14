import { z } from "zod";

export const listDomainBindingsQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  resourceId: z.string().optional(),
});

export type ListDomainBindingsQueryInput = z.input<typeof listDomainBindingsQueryInputSchema>;
