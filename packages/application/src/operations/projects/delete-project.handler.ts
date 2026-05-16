import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteProjectCommand } from "./delete-project.command";
import { type DeleteProjectUseCase } from "./delete-project.use-case";

@CommandHandler(DeleteProjectCommand)
@injectable()
export class DeleteProjectCommandHandler
  implements CommandHandlerContract<DeleteProjectCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteProjectUseCase)
    private readonly useCase: DeleteProjectUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteProjectCommand) {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      confirmation: command.confirmation,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
