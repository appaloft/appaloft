import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type CreateStorageVolumeBackupResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateStorageVolumeBackupCommandInput,
  createStorageVolumeBackupCommandInputSchema,
} from "./create-storage-volume-backup.schema";
import { type StorageBackupPlanRequest } from "./storage-volume-backup-contract";

export { type CreateStorageVolumeBackupCommandInput, createStorageVolumeBackupCommandInputSchema };

export class CreateStorageVolumeBackupCommand extends Command<CreateStorageVolumeBackupResult> {
  constructor(public readonly planRequest: StorageBackupPlanRequest) {
    super();
  }

  get storageVolumeId(): string {
    return this.planRequest.source.storageVolumeId;
  }

  static create(
    input: CreateStorageVolumeBackupCommandInput,
  ): Result<CreateStorageVolumeBackupCommand> {
    return parseOperationInput(createStorageVolumeBackupCommandInputSchema, input).map(
      (parsed) => new CreateStorageVolumeBackupCommand(parsed.planRequest),
    );
  }
}
