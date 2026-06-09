import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type PruneStorageVolumeBackupResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneStorageVolumeBackupCommand } from "./prune-storage-volume-backup.command";
import { type PruneStorageVolumeBackupUseCase } from "./prune-storage-volume-backup.use-case";

@CommandHandler(PruneStorageVolumeBackupCommand)
@injectable()
export class PruneStorageVolumeBackupCommandHandler
  implements CommandHandlerContract<PruneStorageVolumeBackupCommand, PruneStorageVolumeBackupResult>
{
  constructor(
    @inject(tokens.pruneStorageVolumeBackupUseCase)
    private readonly useCase: PruneStorageVolumeBackupUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: PruneStorageVolumeBackupCommand,
  ): Promise<Result<PruneStorageVolumeBackupResult>> {
    return this.useCase.execute(context, { backupId: command.backupId });
  }
}
