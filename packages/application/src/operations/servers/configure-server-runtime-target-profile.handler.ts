import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureServerRuntimeTargetProfileCommand } from "./configure-server-runtime-target-profile.command";
import { type ConfigureServerRuntimeTargetProfileResult } from "./configure-server-runtime-target-profile.schema";
import { type ConfigureServerRuntimeTargetProfileUseCase } from "./configure-server-runtime-target-profile.use-case";

@CommandHandler(ConfigureServerRuntimeTargetProfileCommand)
@injectable()
export class ConfigureServerRuntimeTargetProfileCommandHandler
  implements
    CommandHandlerContract<
      ConfigureServerRuntimeTargetProfileCommand,
      ConfigureServerRuntimeTargetProfileResult
    >
{
  constructor(
    @inject(tokens.configureServerRuntimeTargetProfileUseCase)
    private readonly useCase: ConfigureServerRuntimeTargetProfileUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureServerRuntimeTargetProfileCommand) {
    return this.useCase.execute(context, command.input);
  }
}
