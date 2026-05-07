import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type DeleteScheduledTaskResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteScheduledTaskCommandInput,
  deleteScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export {
  type DeleteScheduledTaskCommandInput,
  type DeleteScheduledTaskCommandPayload,
  deleteScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export class DeleteScheduledTaskCommand extends Command<DeleteScheduledTaskResult> {
  constructor(
    public readonly taskId: string,
    public readonly resourceId: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteScheduledTaskCommandInput): Result<DeleteScheduledTaskCommand> {
    return parseOperationInput(deleteScheduledTaskCommandInputSchema, input).map(
      (parsed) =>
        new DeleteScheduledTaskCommand(
          parsed.taskId,
          parsed.resourceId,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
