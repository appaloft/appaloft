import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ConfigureDependencyResourceBackupPolicyCommand } from "./configure-dependency-resource-backup-policy.command";
import { type ConfigureDependencyResourceBackupPolicyUseCase } from "./configure-dependency-resource-backup-policy.use-case";

@CommandHandler(ConfigureDependencyResourceBackupPolicyCommand)
@injectable()
export class ConfigureDependencyResourceBackupPolicyCommandHandler
  implements CommandHandlerContract<ConfigureDependencyResourceBackupPolicyCommand, { id: string }>
{
  constructor(
    @inject(tokens.configureDependencyResourceBackupPolicyUseCase)
    private readonly useCase: ConfigureDependencyResourceBackupPolicyUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureDependencyResourceBackupPolicyCommand) {
    return this.useCase.execute(context, command.input);
  }
}
