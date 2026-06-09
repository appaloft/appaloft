import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const restoreStorageVolumeBackupCommandInputSchema = z.object({
  backupId: nonEmptyTrimmedString("Storage volume backup id"),
  targetMode: z.enum(["new-volume", "in-place"]).default("new-volume"),
  restoredVolumeName: nonEmptyTrimmedString("Restored storage volume name").optional(),
  targetStorageVolumeId: nonEmptyTrimmedString("Target storage volume id").optional(),
  acknowledgeDestructiveRestore: z.boolean().optional(),
});

export type RestoreStorageVolumeBackupCommandInput = z.output<
  typeof restoreStorageVolumeBackupCommandInputSchema
>;
