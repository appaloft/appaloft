import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureScheduledRuntimePrunePolicyCommand } from "./configure-scheduled-runtime-prune-policy.command";
import { type ConfigureScheduledRuntimePrunePolicyUseCase } from "./configure-scheduled-runtime-prune-policy.use-case";

@CommandHandler(ConfigureScheduledRuntimePrunePolicyCommand)
@injectable()
export class ConfigureScheduledRuntimePrunePolicyCommandHandler
  implements CommandHandlerContract<ConfigureScheduledRuntimePrunePolicyCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureScheduledRuntimePrunePolicyUseCase)
    private readonly useCase: ConfigureScheduledRuntimePrunePolicyUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureScheduledRuntimePrunePolicyCommand) {
    return this.useCase.execute(context, command.input);
  }
}
