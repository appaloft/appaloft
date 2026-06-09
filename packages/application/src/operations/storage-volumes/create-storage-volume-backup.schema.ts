import { z } from "zod";

import { storageBackupPlanRequestSchema } from "./storage-volume-backup.schema";

export const createStorageVolumeBackupCommandInputSchema = z.object({
  planRequest: storageBackupPlanRequestSchema,
});

export type CreateStorageVolumeBackupCommandInput = z.output<
  typeof createStorageVolumeBackupCommandInputSchema
>;
