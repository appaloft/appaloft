import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RestoreProjectCommand } from "./restore-project.command";
import { type RestoreProjectUseCase } from "./restore-project.use-case";

@CommandHandler(RestoreProjectCommand)
@injectable()
export class RestoreProjectCommandHandler
  implements CommandHandlerContract<RestoreProjectCommand, { id: string }>
{
  constructor(
    @inject(tokens.restoreProjectUseCase)
    private readonly useCase: RestoreProjectUseCase,
  ) {}

  handle(context: ExecutionContext, command: RestoreProjectCommand) {
    return this.useCase.execute(context, command);
  }
}
