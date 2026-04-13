import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureServerCredentialCommand } from "./configure-server-credential.command";
import { type ConfigureServerCredentialUseCase } from "./configure-server-credential.use-case";

@CommandHandler(ConfigureServerCredentialCommand)
@injectable()
export class ConfigureServerCredentialCommandHandler
  implements CommandHandlerContract<ConfigureServerCredentialCommand, null>
{
  constructor(
    @inject(tokens.configureServerCredentialUseCase)
    private readonly useCase: ConfigureServerCredentialUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureServerCredentialCommand) {
    return this.useCase.execute(context, {
      serverId: command.serverId,
      credential: command.credential,
    });
  }
}
