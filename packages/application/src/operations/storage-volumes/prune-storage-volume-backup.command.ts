import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type PruneStorageVolumeBackupResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type PruneStorageVolumeBackupCommandInput,
  pruneStorageVolumeBackupCommandInputSchema,
} from "./prune-storage-volume-backup.schema";

export { type PruneStorageVolumeBackupCommandInput, pruneStorageVolumeBackupCommandInputSchema };

export class PruneStorageVolumeBackupCommand extends Command<PruneStorageVolumeBackupResult> {
  constructor(public readonly backupId: string) {
    super();
  }

  static create(
    input: PruneStorageVolumeBackupCommandInput,
  ): Result<PruneStorageVolumeBackupCommand> {
    return parseOperationInput(pruneStorageVolumeBackupCommandInputSchema, input).map(
      (parsed) => new PruneStorageVolumeBackupCommand(parsed.backupId),
    );
  }
}
