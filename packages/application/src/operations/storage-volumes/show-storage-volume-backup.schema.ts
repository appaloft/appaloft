import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showStorageVolumeBackupQueryInputSchema = z.object({
  backupId: nonEmptyTrimmedString("Storage volume backup id"),
});

export type ShowStorageVolumeBackupQueryInput = z.output<
  typeof showStorageVolumeBackupQueryInputSchema
>;
