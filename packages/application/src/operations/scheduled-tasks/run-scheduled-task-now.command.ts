import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type RunScheduledTaskNowResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RunScheduledTaskNowCommandInput,
  runScheduledTaskNowCommandInputSchema,
} from "./scheduled-task.schema";

export {
  type RunScheduledTaskNowCommandInput,
  type RunScheduledTaskNowCommandPayload,
  runScheduledTaskNowCommandInputSchema,
} from "./scheduled-task.schema";

export class RunScheduledTaskNowCommand extends Command<RunScheduledTaskNowResult> {
  constructor(
    public readonly taskId: string,
    public readonly resourceId: string,
    public readonly idempotencyKey?: string,
    public readonly requestedAt?: string,
  ) {
    super();
  }

  static create(input: RunScheduledTaskNowCommandInput): Result<RunScheduledTaskNowCommand> {
    return parseOperationInput(runScheduledTaskNowCommandInputSchema, input).map(
      (parsed) =>
        new RunScheduledTaskNowCommand(
          parsed.taskId,
          parsed.resourceId,
          trimToUndefined(parsed.idempotencyKey),
          trimToUndefined(parsed.requestedAt),
        ),
    );
  }
}
