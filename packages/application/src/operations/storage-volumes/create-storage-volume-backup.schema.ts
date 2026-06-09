import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { storageBackupPlanRequestSchema } from "./storage-volume-backup.schema";

export const createStorageVolumeBackupCommandInputSchema = z
  .object({
    storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
    planRequest: storageBackupPlanRequestSchema,
  })
  .superRefine((value, context) => {
    if (value.storageVolumeId !== value.planRequest.source.storageVolumeId) {
      context.addIssue({
        code: "custom",
        path: ["planRequest", "source", "storageVolumeId"],
        message: "Backup source storageVolumeId must match the route storageVolumeId",
      });
    }
  });

export type CreateStorageVolumeBackupCommandInput = z.output<
  typeof createStorageVolumeBackupCommandInputSchema
>;
