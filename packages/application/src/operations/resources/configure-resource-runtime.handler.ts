import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureResourceRuntimeCommand } from "./configure-resource-runtime.command";
import { type ConfigureResourceRuntimeUseCase } from "./configure-resource-runtime.use-case";

@CommandHandler(ConfigureResourceRuntimeCommand)
@injectable()
export class ConfigureResourceRuntimeCommandHandler
  implements CommandHandlerContract<ConfigureResourceRuntimeCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureResourceRuntimeUseCase)
    private readonly useCase: ConfigureResourceRuntimeUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureResourceRuntimeCommand) {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      runtimeProfile: command.runtimeProfile,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
