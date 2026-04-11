import { z } from "zod";

export const listGitHubRepositoriesQueryInputSchema = z.object({
  search: z.string().optional(),
});

export type ListGitHubRepositoriesQueryInput = z.input<
  typeof listGitHubRepositoriesQueryInputSchema
>;
