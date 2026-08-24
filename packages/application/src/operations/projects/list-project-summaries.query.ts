import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";

export const projectSummarySortSchema = z
  .enum(["recent-activity-desc", "name-asc", "name-desc"])
  .default("recent-activity-desc");

export const listProjectSummariesQueryInputSchema = z.object({
  cursor: z
    .string()
    .trim()
    .regex(/^offset:\d+$/)
    .max(160)
    .optional(),
  limit: z.coerce.number().int().positive().max(100).default(24),
  search: z.string().trim().max(160).optional(),
  sort: projectSummarySortSchema,
});

export type ListProjectSummariesQueryInput = z.input<typeof listProjectSummariesQueryInputSchema>;

export class ListProjectSummariesQuery extends Query<{
  items: import("../../ports").DashboardProjectSummary[];
  nextCursor?: string;
}> {
  constructor(
    public readonly limit: number,
    public readonly sort: z.infer<typeof projectSummarySortSchema>,
    public readonly cursor?: string,
    public readonly search?: string,
  ) {
    super();
  }

  static create(input?: ListProjectSummariesQueryInput): Result<ListProjectSummariesQuery> {
    return parseOperationInput(listProjectSummariesQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListProjectSummariesQuery(
          parsed.limit,
          parsed.sort,
          parsed.cursor,
          parsed.search || undefined,
        ),
    );
  }
}
