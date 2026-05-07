import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RestoreDependencyResourceBackupCommand } from "./restore-dependency-resource-backup.command";
import { type RestoreDependencyResourceBackupUseCase } from "./restore-dependency-resource-backup.use-case";

@CommandHandler(RestoreDependencyResourceBackupCommand)
@injectable()
export class RestoreDependencyResourceBackupCommandHandler
  implements CommandHandlerContract<RestoreDependencyResourceBackupCommand, { id: string }>
{
  constructor(
    @inject(tokens.restoreDependencyResourceBackupUseCase)
    private readonly useCase: RestoreDependencyResourceBackupUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: RestoreDependencyResourceBackupCommand,
  ): Promise<Result<{ id: string }>> {
    return this.useCase.execute(context, {
      backupId: command.backupId,
      acknowledgeDataOverwrite: command.acknowledgeDataOverwrite,
      acknowledgeRuntimeNotRestarted: command.acknowledgeRuntimeNotRestarted,
      ...(command.restoreLabel ? { restoreLabel: command.restoreLabel } : {}),
    });
  }
}
