import { ok, type Result } from "@yundu/core";
import { type z } from "zod";

import { Query } from "../../cqrs";
import { type ProjectSummary } from "../../ports";
import { emptyOperationInputSchema } from "../shared-schema";

export const listProjectsQueryInputSchema = emptyOperationInputSchema;

export type ListProjectsQueryInput = z.input<typeof listProjectsQueryInputSchema>;

export class ListProjectsQuery extends Query<{ items: ProjectSummary[] }> {
  static create(): Result<ListProjectsQuery> {
    return ok(new ListProjectsQuery());
  }
}
