import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ScheduledTaskCommandResult } from "../../ports";
import { tokens } from "../../tokens";
import { CreateScheduledTaskCommand } from "./create-scheduled-task.command";
import { type CreateScheduledTaskUseCase } from "./create-scheduled-task.use-case";

@CommandHandler(CreateScheduledTaskCommand)
@injectable()
export class CreateScheduledTaskCommandHandler
  implements CommandHandlerContract<CreateScheduledTaskCommand, ScheduledTaskCommandResult>
{
  constructor(
    @inject(tokens.createScheduledTaskUseCase)
    private readonly useCase: CreateScheduledTaskUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateScheduledTaskCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      schedule: command.schedule,
      timezone: command.timezone,
      commandIntent: command.commandIntent,
      timeoutSeconds: command.timeoutSeconds,
      retryLimit: command.retryLimit,
      concurrencyPolicy: command.concurrencyPolicy,
      status: command.status,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
