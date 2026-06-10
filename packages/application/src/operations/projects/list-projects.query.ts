import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ProjectSummary } from "../../ports";
import {
  boundedListLimit,
  boundedListOffset,
  listLimitSchema,
  listOffsetSchema,
  parseOperationInput,
} from "../shared-schema";

export const projectListLifecycleStatusSchema = z
  .enum(["active", "archived", "all"])
  .default("active");

export const listProjectsQueryInputSchema = z.object({
  limit: listLimitSchema,
  offset: listOffsetSchema,
  lifecycleStatus: projectListLifecycleStatusSchema,
});

export type ListProjectsQueryInput = z.input<typeof listProjectsQueryInputSchema>;

export class ListProjectsQuery extends Query<{
  items: ProjectSummary[];
  total: number;
  limit: number;
  offset: number;
}> {
  constructor(
    public readonly limit: number,
    public readonly offset: number,
    public readonly lifecycleStatus: z.infer<typeof projectListLifecycleStatusSchema>,
  ) {
    super();
  }

  static create(input?: ListProjectsQueryInput): Result<ListProjectsQuery> {
    return parseOperationInput(listProjectsQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListProjectsQuery(
          boundedListLimit(parsed.limit),
          boundedListOffset(parsed.offset),
          parsed.lifecycleStatus,
        ),
    );
  }
}
