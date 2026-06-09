import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateStorageVolumeBackupPlanQueryInput,
  createStorageVolumeBackupPlanQueryInputSchema,
} from "./create-storage-volume-backup-plan.schema";
import {
  type StorageBackupPlan,
  type StorageBackupPlanRequest,
} from "./storage-volume-backup-contract";

export {
  type CreateStorageVolumeBackupPlanQueryInput,
  createStorageVolumeBackupPlanQueryInputSchema,
};

export class CreateStorageVolumeBackupPlanQuery extends Query<StorageBackupPlan> {
  constructor(public readonly request: StorageBackupPlanRequest) {
    super();
  }

  static create(
    input: CreateStorageVolumeBackupPlanQueryInput,
  ): Result<CreateStorageVolumeBackupPlanQuery> {
    return parseOperationInput(createStorageVolumeBackupPlanQueryInputSchema, input).map(
      ({ storageVolumeId: _storageVolumeId, ...request }) =>
        new CreateStorageVolumeBackupPlanQuery(request),
    );
  }
}
