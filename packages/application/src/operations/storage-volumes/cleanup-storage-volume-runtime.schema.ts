import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const cleanupStorageVolumeRuntimeCommandInputSchema = z.object({
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  serverId: nonEmptyTrimmedString("Server id"),
  before: z.string().datetime({ offset: true }),
  dryRun: z.boolean().default(true),
});

export type CleanupStorageVolumeRuntimeCommandInput = z.input<
  typeof cleanupStorageVolumeRuntimeCommandInputSchema
>;

export type ParsedCleanupStorageVolumeRuntimeCommandInput = z.output<
  typeof cleanupStorageVolumeRuntimeCommandInputSchema
>;
