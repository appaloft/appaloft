import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListScheduledTaskRunsResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListScheduledTaskRunsQueryInput,
  type ListScheduledTaskRunsQueryPayload,
  listScheduledTaskRunsQueryInputSchema,
} from "./scheduled-task.schema";

export {
  type ListScheduledTaskRunsQueryInput,
  type ListScheduledTaskRunsQueryPayload,
  listScheduledTaskRunsQueryInputSchema,
} from "./scheduled-task.schema";

export class ListScheduledTaskRunsQuery extends Query<ListScheduledTaskRunsResult> {
  constructor(
    public readonly taskId?: string,
    public readonly resourceId?: string,
    public readonly status?: ListScheduledTaskRunsQueryPayload["status"],
    public readonly triggerKind?: ListScheduledTaskRunsQueryPayload["triggerKind"],
    public readonly limit?: number,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(input: ListScheduledTaskRunsQueryInput = {}): Result<ListScheduledTaskRunsQuery> {
    return parseOperationInput(listScheduledTaskRunsQueryInputSchema, input).map(
      (parsed) =>
        new ListScheduledTaskRunsQuery(
          trimToUndefined(parsed.taskId),
          trimToUndefined(parsed.resourceId),
          parsed.status,
          parsed.triggerKind,
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
