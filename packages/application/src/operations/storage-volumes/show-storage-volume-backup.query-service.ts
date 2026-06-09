import {
  domainError,
  err,
  ok,
  type Result,
  StorageVolumeBackupByIdSpec,
  StorageVolumeBackupId,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ShowStorageVolumeBackupResult,
  type StorageVolumeBackupReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowStorageVolumeBackupQuery } from "./show-storage-volume-backup.query";

@injectable()
export class ShowStorageVolumeBackupQueryService {
  constructor(
    @inject(tokens.storageVolumeBackupReadModel)
    private readonly storageVolumeBackupReadModel: StorageVolumeBackupReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowStorageVolumeBackupQuery,
  ): Promise<Result<ShowStorageVolumeBackupResult>> {
    const backupId = StorageVolumeBackupId.create(query.backupId);
    if (backupId.isErr()) {
      return err(backupId.error);
    }
    const backup = await this.storageVolumeBackupReadModel.findOne(
      toRepositoryContext(context),
      StorageVolumeBackupByIdSpec.create(backupId.value),
    );
    if (!backup) {
      return err(domainError.notFound("storage_volume_backup", backupId.value.value));
    }
    return ok({
      schemaVersion: "storage-volumes.backups.show/v1",
      backup,
      generatedAt: this.clock.now(),
    });
  }
}
