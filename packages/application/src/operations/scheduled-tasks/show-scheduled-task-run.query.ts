import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowScheduledTaskRunResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ShowScheduledTaskRunQueryInput,
  showScheduledTaskRunQueryInputSchema,
} from "./scheduled-task.schema";

export {
  type ShowScheduledTaskRunQueryInput,
  type ShowScheduledTaskRunQueryPayload,
  showScheduledTaskRunQueryInputSchema,
} from "./scheduled-task.schema";

export class ShowScheduledTaskRunQuery extends Query<ShowScheduledTaskRunResult> {
  constructor(
    public readonly runId: string,
    public readonly taskId?: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(input: ShowScheduledTaskRunQueryInput): Result<ShowScheduledTaskRunQuery> {
    return parseOperationInput(showScheduledTaskRunQueryInputSchema, input).map(
      (parsed) =>
        new ShowScheduledTaskRunQuery(
          parsed.runId,
          trimToUndefined(parsed.taskId),
          trimToUndefined(parsed.resourceId),
        ),
    );
  }
}
