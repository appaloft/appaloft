import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeleteServerCommand } from "./delete-server.command";
import { type DeleteServerUseCase } from "./delete-server.use-case";

@CommandHandler(DeleteServerCommand)
@injectable()
export class DeleteServerCommandHandler
  implements CommandHandlerContract<DeleteServerCommand, { id: string }>
{
  constructor(
    @inject(tokens.deleteServerUseCase)
    private readonly useCase: DeleteServerUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeleteServerCommand) {
    return this.useCase.execute(context, command);
  }
}
