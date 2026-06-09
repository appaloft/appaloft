import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListStorageVolumeBackupsResult,
  type StorageVolumeBackupReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListStorageVolumeBackupsQuery } from "./list-storage-volume-backups.query";

@injectable()
export class ListStorageVolumeBackupsQueryService {
  constructor(
    @inject(tokens.storageVolumeBackupReadModel)
    private readonly storageVolumeBackupReadModel: StorageVolumeBackupReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListStorageVolumeBackupsQuery,
  ): Promise<Result<ListStorageVolumeBackupsResult>> {
    const items = await this.storageVolumeBackupReadModel.list(toRepositoryContext(context), {
      storageVolumeId: query.storageVolumeId,
      ...(query.status ? { status: query.status } : {}),
    });

    return ok({
      schemaVersion: "storage-volumes.backups.list/v1",
      items,
      generatedAt: this.clock.now(),
    });
  }
}
