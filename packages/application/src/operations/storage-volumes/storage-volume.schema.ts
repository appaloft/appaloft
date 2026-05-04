import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const storageVolumeKindSchema = z.enum(["named-volume", "bind-mount"]);
export const storageMountModeSchema = z.enum(["read-write", "read-only"]);

export const storageBackupRelationshipInputSchema = z
  .object({
    retentionRequired: z.boolean().default(false),
    reason: nonEmptyTrimmedString("Backup relationship reason").optional(),
  })
  .optional();

export const storageVolumeResponseSchema = z.object({
  id: z.string(),
});

export type StorageVolumeResponse = z.output<typeof storageVolumeResponseSchema>;
