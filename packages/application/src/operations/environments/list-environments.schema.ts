import { z } from "zod";

export const listEnvironmentsQueryInputSchema = z.object({
  projectId: z.string().optional(),
});

export type ListEnvironmentsQueryInput = z.input<typeof listEnvironmentsQueryInputSchema>;
