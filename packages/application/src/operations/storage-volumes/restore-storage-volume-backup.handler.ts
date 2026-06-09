import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CreateStorageVolumeRestoreResult } from "../../ports";
import { tokens } from "../../tokens";
import { RestoreStorageVolumeBackupCommand } from "./restore-storage-volume-backup.command";
import { type RestoreStorageVolumeBackupUseCase } from "./restore-storage-volume-backup.use-case";

@CommandHandler(RestoreStorageVolumeBackupCommand)
@injectable()
export class RestoreStorageVolumeBackupCommandHandler
  implements
    CommandHandlerContract<RestoreStorageVolumeBackupCommand, CreateStorageVolumeRestoreResult>
{
  constructor(
    @inject(tokens.restoreStorageVolumeBackupUseCase)
    private readonly useCase: RestoreStorageVolumeBackupUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: RestoreStorageVolumeBackupCommand,
  ): Promise<Result<CreateStorageVolumeRestoreResult>> {
    return this.useCase.execute(context, {
      backupId: command.backupId,
      targetMode: command.targetMode,
      ...(command.restoredVolumeName ? { restoredVolumeName: command.restoredVolumeName } : {}),
      ...(command.targetStorageVolumeId
        ? { targetStorageVolumeId: command.targetStorageVolumeId }
        : {}),
      ...(command.acknowledgeDestructiveRestore !== undefined
        ? { acknowledgeDestructiveRestore: command.acknowledgeDestructiveRestore }
        : {}),
    });
  }
}
