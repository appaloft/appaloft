import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RenameProjectCommand } from "./rename-project.command";
import { type RenameProjectUseCase } from "./rename-project.use-case";

@CommandHandler(RenameProjectCommand)
@injectable()
export class RenameProjectCommandHandler
  implements CommandHandlerContract<RenameProjectCommand, { id: string }>
{
  constructor(
    @inject(tokens.renameProjectUseCase)
    private readonly useCase: RenameProjectUseCase,
  ) {}

  handle(context: ExecutionContext, command: RenameProjectCommand) {
    return this.useCase.execute(context, command);
  }
}
