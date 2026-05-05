import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListScheduledTasksResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListScheduledTasksQueryInput,
  type ListScheduledTasksQueryPayload,
  listScheduledTasksQueryInputSchema,
} from "./scheduled-task.schema";

export {
  type ListScheduledTasksQueryInput,
  type ListScheduledTasksQueryPayload,
  listScheduledTasksQueryInputSchema,
} from "./scheduled-task.schema";

export class ListScheduledTasksQuery extends Query<ListScheduledTasksResult> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly resourceId?: string,
    public readonly status?: ListScheduledTasksQueryPayload["status"],
    public readonly limit?: number,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(input: ListScheduledTasksQueryInput = {}): Result<ListScheduledTasksQuery> {
    return parseOperationInput(listScheduledTasksQueryInputSchema, input).map(
      (parsed) =>
        new ListScheduledTasksQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.environmentId),
          trimToUndefined(parsed.resourceId),
          parsed.status,
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
