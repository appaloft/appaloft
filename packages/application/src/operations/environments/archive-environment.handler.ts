import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ArchiveEnvironmentCommand } from "./archive-environment.command";
import { type ArchiveEnvironmentUseCase } from "./archive-environment.use-case";

@CommandHandler(ArchiveEnvironmentCommand)
@injectable()
export class ArchiveEnvironmentCommandHandler
  implements CommandHandlerContract<ArchiveEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.archiveEnvironmentUseCase)
    private readonly useCase: ArchiveEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: ArchiveEnvironmentCommand) {
    return this.useCase.execute(context, command);
  }
}
