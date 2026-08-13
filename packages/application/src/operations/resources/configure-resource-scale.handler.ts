import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceScaleCommand } from "./configure-resource-scale.command";
import { type ConfigureResourceScaleUseCase } from "./configure-resource-scale.use-case";

@CommandHandler(ConfigureResourceScaleCommand)
@injectable()
export class ConfigureResourceScaleCommandHandler
  implements CommandHandlerContract<ConfigureResourceScaleCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceScaleUseCase)
    private readonly useCase: ConfigureResourceScaleUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceScaleCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      scaleProfile: command.scaleProfile,
    });
  }
}
