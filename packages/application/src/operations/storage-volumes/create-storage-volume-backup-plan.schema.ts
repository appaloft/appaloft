import { type z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { storageBackupPlanRequestSchema } from "./storage-volume-backup.schema";

export const createStorageVolumeBackupPlanQueryInputSchema = storageBackupPlanRequestSchema
  .extend({
    storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  })
  .superRefine((value, context) => {
    if (value.storageVolumeId !== value.source.storageVolumeId) {
      context.addIssue({
        code: "custom",
        path: ["source", "storageVolumeId"],
        message: "Backup source storageVolumeId must match the route storageVolumeId",
      });
    }
  });

export type CreateStorageVolumeBackupPlanQueryInput = z.output<
  typeof createStorageVolumeBackupPlanQueryInputSchema
>;
