import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ReorderProjectsCommand } from "./reorder-projects.command";
import { type ReorderProjectsUseCase } from "./reorder-projects.use-case";

@CommandHandler(ReorderProjectsCommand)
@injectable()
export class ReorderProjectsCommandHandler
  implements CommandHandlerContract<ReorderProjectsCommand, { reorderedProjectIds: string[] }>
{
  constructor(
    @inject(tokens.reorderProjectsUseCase)
    private readonly useCase: ReorderProjectsUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReorderProjectsCommand) {
    return this.useCase.execute(context, command);
  }
}
