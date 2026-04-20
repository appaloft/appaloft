import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceSourceCommand } from "./configure-resource-source.command";
import { type ConfigureResourceSourceUseCase } from "./configure-resource-source.use-case";

@CommandHandler(ConfigureResourceSourceCommand)
@injectable()
export class ConfigureResourceSourceCommandHandler
  implements CommandHandlerContract<ConfigureResourceSourceCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceSourceUseCase)
    private readonly useCase: ConfigureResourceSourceUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceSourceCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      source: command.source,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
