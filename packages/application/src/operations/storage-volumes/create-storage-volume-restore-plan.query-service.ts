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
import { type StorageVolumeBackupReadModel, type StorageVolumeRestorePlan } from "../../ports";
import { tokens } from "../../tokens";
import { type CreateStorageVolumeRestorePlanQuery } from "./create-storage-volume-restore-plan.query";

@injectable()
export class CreateStorageVolumeRestorePlanQueryService {
  constructor(
    @inject(tokens.storageVolumeBackupReadModel)
    private readonly storageVolumeBackupReadModel: StorageVolumeBackupReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CreateStorageVolumeRestorePlanQuery,
  ): Promise<Result<StorageVolumeRestorePlan>> {
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

    const blockers: StorageVolumeRestorePlan["blockers"] = [];
    if (backup.status !== "ready" || !backup.artifactHandle) {
      blockers.push({
        code: "backup-not-ready",
        message: "Storage volume backup is not ready to restore.",
      });
    }
    if (query.targetMode === "in-place") {
      blockers.push({
        code: query.acknowledgeDestructiveRestore
          ? "in-place-restore-not-enabled"
          : "destructive-acknowledgement-required",
        message: query.acknowledgeDestructiveRestore
          ? "In-place storage volume restore is not enabled in this public slice."
          : "In-place storage volume restore requires explicit destructive acknowledgement.",
      });
    }

    return ok({
      schemaVersion: "storage-volumes.restore-plan/v1",
      backupId: backup.id,
      sourceStorageVolumeId: backup.storageVolumeId,
      targetMode: query.targetMode,
      destructive: query.targetMode === "in-place",
      ...(query.targetStorageVolumeId
        ? { targetStorageVolumeId: query.targetStorageVolumeId }
        : {}),
      defaultRestoredVolumeName: `restore-${backup.storageVolumeId}-${backup.id}`,
      blockers,
    });
  }
}
