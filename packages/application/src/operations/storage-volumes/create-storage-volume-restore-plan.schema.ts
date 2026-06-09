import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createStorageVolumeRestorePlanQueryInputSchema = z.object({
  backupId: nonEmptyTrimmedString("Storage volume backup id"),
  targetMode: z.enum(["new-volume", "in-place"]).default("new-volume"),
  targetStorageVolumeId: nonEmptyTrimmedString("Target storage volume id").optional(),
  acknowledgeDestructiveRestore: z.boolean().optional(),
});

export type CreateStorageVolumeRestorePlanQueryInput = z.output<
  typeof createStorageVolumeRestorePlanQueryInputSchema
>;
