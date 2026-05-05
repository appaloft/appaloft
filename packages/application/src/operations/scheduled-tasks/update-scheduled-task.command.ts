import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ScheduledTaskCommandResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureScheduledTaskCommandInput,
  type ConfigureScheduledTaskCommandPayload,
  configureScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export {
  type ConfigureScheduledTaskCommandInput,
  type ConfigureScheduledTaskCommandPayload,
  configureScheduledTaskCommandInputSchema,
} from "./scheduled-task.schema";

export class ConfigureScheduledTaskCommand extends Command<ScheduledTaskCommandResult> {
  constructor(
    public readonly taskId: string,
    public readonly resourceId: string,
    public readonly schedule?: string,
    public readonly timezone?: string,
    public readonly commandIntent?: string,
    public readonly timeoutSeconds?: number,
    public readonly retryLimit?: number,
    public readonly concurrencyPolicy?: ConfigureScheduledTaskCommandPayload["concurrencyPolicy"],
    public readonly status?: ConfigureScheduledTaskCommandPayload["status"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: ConfigureScheduledTaskCommandInput): Result<ConfigureScheduledTaskCommand> {
    return parseOperationInput(configureScheduledTaskCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureScheduledTaskCommand(
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
