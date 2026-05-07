import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ScheduledTaskRunLogsResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ScheduledTaskRunLogsQueryInput,
  scheduledTaskRunLogsQueryInputSchema,
} from "./scheduled-task.schema";

export {
  type ScheduledTaskRunLogsQueryInput,
  type ScheduledTaskRunLogsQueryPayload,
  scheduledTaskRunLogsQueryInputSchema,
} from "./scheduled-task.schema";

export class ScheduledTaskRunLogsQuery extends Query<ScheduledTaskRunLogsResult> {
  constructor(
    public readonly runId: string,
    public readonly taskId?: string,
    public readonly resourceId?: string,
    public readonly cursor?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input: ScheduledTaskRunLogsQueryInput): Result<ScheduledTaskRunLogsQuery> {
    return parseOperationInput(scheduledTaskRunLogsQueryInputSchema, input).map(
      (parsed) =>
        new ScheduledTaskRunLogsQuery(
          parsed.runId,
          trimToUndefined(parsed.taskId),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.cursor),
          parsed.limit,
        ),
    );
  }
}
