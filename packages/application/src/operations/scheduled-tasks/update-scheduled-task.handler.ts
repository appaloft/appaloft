import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ScheduledTaskCommandResult } from "../../ports";
import { tokens } from "../../tokens";
import { UpdateScheduledTaskCommand } from "./update-scheduled-task.command";
import { type UpdateScheduledTaskUseCase } from "./update-scheduled-task.use-case";

@CommandHandler(UpdateScheduledTaskCommand)
@injectable()
export class UpdateScheduledTaskCommandHandler
  implements CommandHandlerContract<UpdateScheduledTaskCommand, ScheduledTaskCommandResult>
{
  constructor(
    @inject(tokens.updateScheduledTaskUseCase)
    private readonly useCase: UpdateScheduledTaskUseCase,
  ) {}

  handle(context: ExecutionContext, command: UpdateScheduledTaskCommand) {
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
