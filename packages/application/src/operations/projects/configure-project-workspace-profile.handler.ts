import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureProjectWorkspaceProfileCommand } from "./configure-project-workspace-profile.command";
import { type ConfigureProjectWorkspaceProfileUseCase } from "./configure-project-workspace-profile.use-case";

@CommandHandler(ConfigureProjectWorkspaceProfileCommand)
@injectable()
export class ConfigureProjectWorkspaceProfileCommandHandler
  implements
    CommandHandlerContract<
      ConfigureProjectWorkspaceProfileCommand,
      { projectId: string; profileInstallationId: string }
    >
{
  constructor(
    @inject(tokens.configureProjectWorkspaceProfileUseCase)
    private readonly useCase: ConfigureProjectWorkspaceProfileUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureProjectWorkspaceProfileCommand) {
    return this.useCase.execute(context, command.input);
  }
}
