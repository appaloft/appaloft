import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { storageMountModeSchema } from "../storage-volumes/storage-volume.schema";
import { storageBackupDataFormatSchema } from "../storage-volumes/storage-volume-backup.schema";

export const attachResourceStorageCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  destinationPath: nonEmptyTrimmedString("Storage destination path"),
  mountMode: storageMountModeSchema.default("read-write"),
  dataFormat: storageBackupDataFormatSchema.optional(),
  applicationDataLabel: nonEmptyTrimmedString("Application data label").optional(),
});

export type AttachResourceStorageCommandInput = z.output<
  typeof attachResourceStorageCommandInputSchema
>;
