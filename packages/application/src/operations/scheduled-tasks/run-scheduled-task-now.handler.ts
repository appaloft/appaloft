import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RunScheduledTaskNowResult } from "../../ports";
import { tokens } from "../../tokens";
import { RunScheduledTaskNowCommand } from "./run-scheduled-task-now.command";
import { type RunScheduledTaskNowUseCase } from "./run-scheduled-task-now.use-case";

@CommandHandler(RunScheduledTaskNowCommand)
@injectable()
export class RunScheduledTaskNowCommandHandler
  implements CommandHandlerContract<RunScheduledTaskNowCommand, RunScheduledTaskNowResult>
{
  constructor(
    @inject(tokens.runScheduledTaskNowUseCase)
    private readonly useCase: RunScheduledTaskNowUseCase,
  ) {}

  handle(context: ExecutionContext, command: RunScheduledTaskNowCommand) {
    return this.useCase.execute(context, {
      taskId: command.taskId,
      resourceId: command.resourceId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
      ...(command.requestedAt ? { requestedAt: command.requestedAt } : {}),
    });
  }
}
