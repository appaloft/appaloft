import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ScheduledTaskCommandResult } from "../../ports";
import { tokens } from "../../tokens";
import { ConfigureScheduledTaskCommand } from "./update-scheduled-task.command";
import { type ConfigureScheduledTaskUseCase } from "./update-scheduled-task.use-case";

@CommandHandler(ConfigureScheduledTaskCommand)
@injectable()
export class ConfigureScheduledTaskCommandHandler
  implements CommandHandlerContract<ConfigureScheduledTaskCommand, ScheduledTaskCommandResult>
{
  constructor(
    @inject(tokens.configureScheduledTaskUseCase)
    private readonly useCase: ConfigureScheduledTaskUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureScheduledTaskCommand) {
    return this.useCase.execute(context, {
      taskId: command.taskId,
      resourceId: command.resourceId,
      ...(command.schedule ? { schedule: command.schedule } : {}),
      ...(command.timezone ? { timezone: command.timezone } : {}),
      ...(command.commandIntent ? { commandIntent: command.commandIntent } : {}),
      ...(command.timeoutSeconds !== undefined ? { timeoutSeconds: command.timeoutSeconds } : {}),
      ...(command.retryLimit !== undefined ? { retryLimit: command.retryLimit } : {}),
      ...(command.concurrencyPolicy ? { concurrencyPolicy: command.concurrencyPolicy } : {}),
      ...(command.status ? { status: command.status } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
