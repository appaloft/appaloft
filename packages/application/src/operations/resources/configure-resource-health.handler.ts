import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceHealthCommand } from "./configure-resource-health.command";
import { type ConfigureResourceHealthUseCase } from "./configure-resource-health.use-case";

@CommandHandler(ConfigureResourceHealthCommand)
@injectable()
export class ConfigureResourceHealthCommandHandler
  implements CommandHandlerContract<ConfigureResourceHealthCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceHealthUseCase)
    private readonly useCase: ConfigureResourceHealthUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceHealthCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      healthCheck: command.healthCheck,
    });
  }
}
