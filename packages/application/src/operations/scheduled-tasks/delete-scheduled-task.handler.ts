import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeleteScheduledTaskResult } from "../../ports";
import { tokens } from "../../tokens";
import { DeleteScheduledTaskCommand } from "./delete-scheduled-task.command";
import { type DeleteScheduledTaskUseCase } from "./delete-scheduled-task.use-case";

@CommandHandler(DeleteScheduledTaskCommand)
@injectable()
export class DeleteScheduledTaskCommandHandler
  implements CommandHandlerContract<DeleteScheduledTaskCommand, DeleteScheduledTaskResult>
{
  constructor(
    @inject(tokens.deleteScheduledTaskUseCase)
    private readonly useCase: DeleteScheduledTaskUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteScheduledTaskCommand) {
    return this.useCase.execute(context, {
      taskId: command.taskId,
      resourceId: command.resourceId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
