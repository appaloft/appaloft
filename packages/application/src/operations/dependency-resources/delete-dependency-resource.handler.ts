import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteDependencyResourceCommand } from "./delete-dependency-resource.command";
import { type DeleteDependencyResourceUseCase } from "./delete-dependency-resource.use-case";

@CommandHandler(DeleteDependencyResourceCommand)
@injectable()
export class DeleteDependencyResourceCommandHandler
  implements CommandHandlerContract<DeleteDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteDependencyResourceUseCase)
    private readonly useCase: DeleteDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: DeleteDependencyResourceCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      dependencyResourceId: command.dependencyResourceId,
    });
  }
}
