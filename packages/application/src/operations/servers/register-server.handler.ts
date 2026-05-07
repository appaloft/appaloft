import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RegisterServerCommand } from "./register-server.command";
import { type RegisterServerUseCase } from "./register-server.use-case";

@CommandHandler(RegisterServerCommand)
@injectable()
export class RegisterServerCommandHandler
  implements CommandHandlerContract<RegisterServerCommand, { id: string }>
{
  constructor(
    @inject(tokens.registerServerUseCase)
    private readonly useCase: RegisterServerUseCase,
  ) {}

  handle(context: ExecutionContext, command: RegisterServerCommand) {
    return this.useCase.execute(context, {
      name: command.name,
      host: command.host,
      providerKey: command.providerKey,
      targetKind: command.targetKind,
      ...(typeof command.port === "number" ? { port: command.port } : {}),
      proxyKind: command.proxyKind,
    });
  }
}
