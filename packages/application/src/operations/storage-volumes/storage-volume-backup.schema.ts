import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const storageBackupConsistencyLevelSchema = z.enum([
  "crash-consistent",
  "quiesced",
  "application-consistent",
  "provider-snapshot-consistent",
]);

export const storageBackupDataFormatSchema = z.enum([
  "sqlite",
  "json-files",
  "filesystem",
  "application-export",
  "unknown",
]);

export const storageBackupSourceAdapterKeySchema = z.enum([
  "tar-volume",
  "sqlite-online-backup",
  "quiesce-and-copy",
  "app-export",
  "provider-snapshot",
  "unsupported",
]);

export const storageBackupTargetProviderKeySchema = z.enum([
  "local-filesystem",
  "s3-compatible",
  "webdav",
  "restic-repository",
  "provider-volume-snapshot",
]);

export const storageBackupSourceDescriptorSchema = z.object({
  storageVolumeId: nonEmptyTrimmedString("Storage volume id"),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  attachmentId: nonEmptyTrimmedString("Attachment id").optional(),
  destinationPath: nonEmptyTrimmedString("Destination path").optional(),
  dataFormat: storageBackupDataFormatSchema.optional(),
  liveWrites: z.boolean().optional(),
});

export const storageBackupTargetDescriptorSchema = z.object({
  providerKey: storageBackupTargetProviderKeySchema,
  targetRef: nonEmptyTrimmedString("Backup target ref"),
  failureDomain: nonEmptyTrimmedString("Failure domain").optional(),
  secretRef: nonEmptyTrimmedString("Backup target secret ref").optional(),
});

export const storageBackupRetentionPolicySchema = z.object({
  maxCount: z.coerce.number().int(),
  maxAgeDays: z.coerce.number().int().positive().optional(),
  maxBytes: z.coerce.number().int().positive().optional(),
  minFreeBytes: z.coerce.number().int().positive().optional(),
});

export const storageBackupPlanRequestSchema = z.object({
  source: storageBackupSourceDescriptorSchema,
  requestedConsistency: storageBackupConsistencyLevelSchema,
  preferredSourceAdapter: storageBackupSourceAdapterKeySchema.optional(),
  target: storageBackupTargetDescriptorSchema,
  retention: storageBackupRetentionPolicySchema,
});

export type StorageBackupPlanRequestInput = z.output<typeof storageBackupPlanRequestSchema>;
