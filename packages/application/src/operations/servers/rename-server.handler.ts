import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RenameServerCommand } from "./rename-server.command";
import { type RenameServerUseCase } from "./rename-server.use-case";

@CommandHandler(RenameServerCommand)
@injectable()
export class RenameServerCommandHandler
  implements CommandHandlerContract<RenameServerCommand, { id: string }>
{
  constructor(
    @inject(tokens.renameServerUseCase)
    private readonly useCase: RenameServerUseCase,
  ) {}

  handle(context: ExecutionContext, command: RenameServerCommand) {
    return this.useCase.execute(context, {
      serverId: command.serverId,
      name: command.name,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
