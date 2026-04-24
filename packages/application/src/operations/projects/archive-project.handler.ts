import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ArchiveProjectCommand } from "./archive-project.command";
import { type ArchiveProjectUseCase } from "./archive-project.use-case";

@CommandHandler(ArchiveProjectCommand)
@injectable()
export class ArchiveProjectCommandHandler
  implements CommandHandlerContract<ArchiveProjectCommand, { id: string }>
{
  constructor(
    @inject(tokens.archiveProjectUseCase)
    private readonly useCase: ArchiveProjectUseCase,
  ) {}

  handle(context: ExecutionContext, command: ArchiveProjectCommand) {
    return this.useCase.execute(context, command);
  }
}
