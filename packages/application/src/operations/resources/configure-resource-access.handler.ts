import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceAccessCommand } from "./configure-resource-access.command";
import { type ConfigureResourceAccessUseCase } from "./configure-resource-access.use-case";

@CommandHandler(ConfigureResourceAccessCommand)
@injectable()
export class ConfigureResourceAccessCommandHandler
  implements CommandHandlerContract<ConfigureResourceAccessCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceAccessUseCase)
    private readonly useCase: ConfigureResourceAccessUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceAccessCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      accessProfile: command.accessProfile,
    });
  }
}
