import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowScheduledTaskResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ShowScheduledTaskQueryInput,
  showScheduledTaskQueryInputSchema,
} from "./scheduled-task.schema";

export {
  type ShowScheduledTaskQueryInput,
  type ShowScheduledTaskQueryPayload,
  showScheduledTaskQueryInputSchema,
} from "./scheduled-task.schema";

export class ShowScheduledTaskQuery extends Query<ShowScheduledTaskResult> {
  constructor(
    public readonly taskId: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(input: ShowScheduledTaskQueryInput): Result<ShowScheduledTaskQuery> {
    return parseOperationInput(showScheduledTaskQueryInputSchema, input).map(
      (parsed) => new ShowScheduledTaskQuery(parsed.taskId, trimToUndefined(parsed.resourceId)),
    );
  }
}
