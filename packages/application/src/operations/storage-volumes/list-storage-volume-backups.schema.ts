import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const listStorageVolumeBackupsQueryInputSchema = z.object({
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  status: z.enum(["pending", "ready", "failed", "pruned"]).optional(),
});

export type ListStorageVolumeBackupsQueryInput = z.output<
  typeof listStorageVolumeBackupsQueryInputSchema
>;
