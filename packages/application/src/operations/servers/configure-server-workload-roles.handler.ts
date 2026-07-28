import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureServerWorkloadRolesCommand } from "./configure-server-workload-roles.command";
import { type ConfigureServerWorkloadRolesResult } from "./configure-server-workload-roles.schema";
import { type ConfigureServerWorkloadRolesUseCase } from "./configure-server-workload-roles.use-case";

@CommandHandler(ConfigureServerWorkloadRolesCommand)
@injectable()
export class ConfigureServerWorkloadRolesCommandHandler
  implements
    CommandHandlerContract<ConfigureServerWorkloadRolesCommand, ConfigureServerWorkloadRolesResult>
{
  constructor(
    @inject(tokens.configureServerWorkloadRolesUseCase)
    private readonly useCase: ConfigureServerWorkloadRolesUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureServerWorkloadRolesCommand) {
    return this.useCase.execute(context, {
      serverId: command.serverId,
      workloadRoles: command.workloadRoles,
    });
  }
}
