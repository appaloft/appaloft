import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RenameDependencyResourceCommand } from "./rename-dependency-resource.command";
import { type RenameDependencyResourceUseCase } from "./rename-dependency-resource.use-case";

@CommandHandler(RenameDependencyResourceCommand)
@injectable()
export class RenameDependencyResourceCommandHandler
  implements CommandHandlerContract<RenameDependencyResourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.renameDependencyResourceUseCase)
    private readonly useCase: RenameDependencyResourceUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: RenameDependencyResourceCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      dependencyResourceId: command.dependencyResourceId,
      name: command.name,
    });
  }
}
