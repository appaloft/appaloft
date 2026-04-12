import { z } from "zod";

export const listDeploymentsQueryInputSchema = z.object({
  projectId: z.string().optional(),
  resourceId: z.string().optional(),
});

export type ListDeploymentsQueryInput = z.input<typeof listDeploymentsQueryInputSchema>;
