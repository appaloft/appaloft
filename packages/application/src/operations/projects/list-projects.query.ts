import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ProjectSummary } from "../../ports";
import { boundedListLimit, listLimitSchema, parseOperationInput } from "../shared-schema";

export const listProjectsQueryInputSchema = z.object({
  limit: listLimitSchema,
});

export type ListProjectsQueryInput = z.input<typeof listProjectsQueryInputSchema>;

export class ListProjectsQuery extends Query<{ items: ProjectSummary[] }> {
  constructor(public readonly limit: number) {
    super();
  }

  static create(input?: ListProjectsQueryInput): Result<ListProjectsQuery> {
    return parseOperationInput(listProjectsQueryInputSchema, input ?? {}).map(
      (parsed) => new ListProjectsQuery(boundedListLimit(parsed.limit)),
    );
  }
}
