import { z } from "zod";

export const listResourcesQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
});

export type ListResourcesQueryInput = z.input<typeof listResourcesQueryInputSchema>;
