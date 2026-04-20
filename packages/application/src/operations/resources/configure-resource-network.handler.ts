import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceNetworkCommand } from "./configure-resource-network.command";
import { type ConfigureResourceNetworkUseCase } from "./configure-resource-network.use-case";

@CommandHandler(ConfigureResourceNetworkCommand)
@injectable()
export class ConfigureResourceNetworkCommandHandler
  implements CommandHandlerContract<ConfigureResourceNetworkCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceNetworkUseCase)
    private readonly useCase: ConfigureResourceNetworkUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceNetworkCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      networkProfile: command.networkProfile,
    });
  }
}
