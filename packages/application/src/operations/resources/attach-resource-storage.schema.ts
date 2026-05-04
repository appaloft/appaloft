import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { storageMountModeSchema } from "../storage-volumes/storage-volume.schema";

export const attachResourceStorageCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  destinationPath: nonEmptyTrimmedString("Storage destination path"),
  mountMode: storageMountModeSchema.default("read-write"),
});

export type AttachResourceStorageCommandInput = z.output<
  typeof attachResourceStorageCommandInputSchema
>;
