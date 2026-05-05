import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ScheduledTaskCommandResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type UpdateScheduledTaskCommandInput,
  type UpdateScheduledTaskCommandPayload,
  updateScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export {
  type UpdateScheduledTaskCommandInput,
  type UpdateScheduledTaskCommandPayload,
  updateScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export class UpdateScheduledTaskCommand extends Command<ScheduledTaskCommandResult> {
  constructor(
    public readonly taskId: string,
    public readonly resourceId: string,
    public readonly schedule?: string,
    public readonly timezone?: string,
    public readonly commandIntent?: string,
    public readonly timeoutSeconds?: number,
    public readonly retryLimit?: number,
    public readonly concurrencyPolicy?: UpdateScheduledTaskCommandPayload["concurrencyPolicy"],
    public readonly status?: UpdateScheduledTaskCommandPayload["status"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: UpdateScheduledTaskCommandInput): Result<UpdateScheduledTaskCommand> {
    return parseOperationInput(updateScheduledTaskCommandInputSchema, input).map(
      (parsed) =>
        new UpdateScheduledTaskCommand(
          parsed.taskId,
          parsed.resourceId,
          trimToUndefined(parsed.schedule),
          trimToUndefined(parsed.timezone),
          trimToUndefined(parsed.commandIntent),
          parsed.timeoutSeconds,
          parsed.retryLimit,
          parsed.concurrencyPolicy,
          parsed.status,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
