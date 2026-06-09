import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type CreateStorageVolumeRestoreResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type RestoreStorageVolumeBackupCommandInput,
  restoreStorageVolumeBackupCommandInputSchema,
} from "./restore-storage-volume-backup.schema";

export {
  type RestoreStorageVolumeBackupCommandInput,
  restoreStorageVolumeBackupCommandInputSchema,
};

export class RestoreStorageVolumeBackupCommand extends Command<CreateStorageVolumeRestoreResult> {
  constructor(
    public readonly backupId: string,
    public readonly targetMode: RestoreStorageVolumeBackupCommandInput["targetMode"],
    public readonly restoredVolumeName?: string,
    public readonly targetStorageVolumeId?: string,
    public readonly acknowledgeDestructiveRestore?: boolean,
  ) {
    super();
  }

  static create(
    input: RestoreStorageVolumeBackupCommandInput,
  ): Result<RestoreStorageVolumeBackupCommand> {
    return parseOperationInput(restoreStorageVolumeBackupCommandInputSchema, input).map(
      (parsed) =>
        new RestoreStorageVolumeBackupCommand(
          parsed.backupId,
          parsed.targetMode,
          parsed.restoredVolumeName,
          parsed.targetStorageVolumeId,
          parsed.acknowledgeDestructiveRestore,
        ),
    );
  }
}
