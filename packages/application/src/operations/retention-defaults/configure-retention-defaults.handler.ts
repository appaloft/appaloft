import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureRetentionDefaultsCommand } from "./configure-retention-defaults.command";
import { type ConfigureRetentionDefaultsUseCase } from "./configure-retention-defaults.use-case";

@CommandHandler(ConfigureRetentionDefaultsCommand)
@injectable()
export class ConfigureRetentionDefaultsCommandHandler
  implements CommandHandlerContract<ConfigureRetentionDefaultsCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureRetentionDefaultsUseCase)
    private readonly useCase: ConfigureRetentionDefaultsUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureRetentionDefaultsCommand) {
    return this.useCase.execute(context, command.input);
  }
}
