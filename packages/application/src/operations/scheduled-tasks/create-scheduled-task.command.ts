import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ScheduledTaskCommandResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type CreateScheduledTaskCommandInput,
  type CreateScheduledTaskCommandPayload,
  createScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export {
  type CreateScheduledTaskCommandInput,
  type CreateScheduledTaskCommandPayload,
  createScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export class CreateScheduledTaskCommand extends Command<ScheduledTaskCommandResult> {
  constructor(
    public readonly resourceId: string,
    public readonly schedule: string,
    public readonly timezone: string,
    public readonly commandIntent: string,
    public readonly timeoutSeconds: number,
    public readonly retryLimit: number,
    public readonly concurrencyPolicy: CreateScheduledTaskCommandPayload["concurrencyPolicy"],
    public readonly status: CreateScheduledTaskCommandPayload["status"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: CreateScheduledTaskCommandInput): Result<CreateScheduledTaskCommand> {
    return parseOperationInput(createScheduledTaskCommandInputSchema, input).map(
      (parsed) =>
        new CreateScheduledTaskCommand(
          parsed.resourceId,
          parsed.schedule,
          parsed.timezone,
          parsed.commandIntent,
          parsed.timeoutSeconds,
          parsed.retryLimit,
          parsed.concurrencyPolicy,
          parsed.status,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
