import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DeactivateServerCommand } from "./deactivate-server.command";
import { type DeactivateServerUseCase } from "./deactivate-server.use-case";

@CommandHandler(DeactivateServerCommand)
@injectable()
export class DeactivateServerCommandHandler
  implements CommandHandlerContract<DeactivateServerCommand, { id: string }>
{
  constructor(
    @inject(tokens.deactivateServerUseCase)
    private readonly useCase: DeactivateServerUseCase,
  ) {}

  handle(context: ExecutionContext, command: DeactivateServerCommand) {
    return this.useCase.execute(context, {
      serverId: command.serverId,
      ...(command.reason ? { reason: command.reason } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
