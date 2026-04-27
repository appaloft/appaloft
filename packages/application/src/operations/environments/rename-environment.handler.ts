import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RenameEnvironmentCommand } from "./rename-environment.command";
import { type RenameEnvironmentUseCase } from "./rename-environment.use-case";

@CommandHandler(RenameEnvironmentCommand)
@injectable()
export class RenameEnvironmentCommandHandler
  implements CommandHandlerContract<RenameEnvironmentCommand, { id: string }>
{
  constructor(
    @inject(tokens.renameEnvironmentUseCase)
    private readonly useCase: RenameEnvironmentUseCase,
  ) {}

  handle(context: ExecutionContext, command: RenameEnvironmentCommand) {
    return this.useCase.execute(context, command);
  }
}
