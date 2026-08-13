import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceRolloutCommand } from "./configure-resource-rollout.command";
import { type ConfigureResourceRolloutUseCase } from "./configure-resource-rollout.use-case";

@CommandHandler(ConfigureResourceRolloutCommand)
@injectable()
export class ConfigureResourceRolloutCommandHandler
  implements CommandHandlerContract<ConfigureResourceRolloutCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceRolloutUseCase)
    private readonly useCase: ConfigureResourceRolloutUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceRolloutCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      rolloutProfile: command.rolloutProfile,
    });
  }
}
