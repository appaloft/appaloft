import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type StorageVolumeRestorePlan } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateStorageVolumeRestorePlanQueryInput,
  createStorageVolumeRestorePlanQueryInputSchema,
} from "./create-storage-volume-restore-plan.schema";

export {
  type CreateStorageVolumeRestorePlanQueryInput,
  createStorageVolumeRestorePlanQueryInputSchema,
};

export class CreateStorageVolumeRestorePlanQuery extends Query<StorageVolumeRestorePlan> {
  constructor(
    public readonly backupId: string,
    public readonly targetMode: CreateStorageVolumeRestorePlanQueryInput["targetMode"],
    public readonly targetStorageVolumeId?: string,
    public readonly acknowledgeDestructiveRestore?: boolean,
  ) {
    super();
  }

  static create(
    input: CreateStorageVolumeRestorePlanQueryInput,
  ): Result<CreateStorageVolumeRestorePlanQuery> {
    return parseOperationInput(createStorageVolumeRestorePlanQueryInputSchema, input).map(
      (parsed) =>
        new CreateStorageVolumeRestorePlanQuery(
          parsed.backupId,
          parsed.targetMode,
          parsed.targetStorageVolumeId,
          parsed.acknowledgeDestructiveRestore,
        ),
    );
  }
}
