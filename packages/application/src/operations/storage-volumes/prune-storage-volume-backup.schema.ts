import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const pruneStorageVolumeBackupCommandInputSchema = z.object({
  backupId: nonEmptyTrimmedString("Storage volume backup id"),
});

export type PruneStorageVolumeBackupCommandInput = z.output<
  typeof pruneStorageVolumeBackupCommandInputSchema
>;
