import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import {
  storageBackupRelationshipInputSchema,
  storageVolumeKindSchema,
} from "./storage-volume.schema";

export const createStorageVolumeCommandInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    environmentId: nonEmptyTrimmedString("Environment id"),
    name: nonEmptyTrimmedString("Storage volume name"),
    kind: storageVolumeKindSchema,
    description: nonEmptyTrimmedString("Description").optional(),
    sourcePath: nonEmptyTrimmedString("Source path").optional(),
    backupRelationship: storageBackupRelationshipInputSchema,
  })
  .superRefine((value, context) => {
    if (value.kind === "bind-mount" && !value.sourcePath) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bind mount storage volumes require sourcePath",
        path: ["sourcePath"],
      });
    }
    if (value.kind === "named-volume" && value.sourcePath) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Named storage volumes must not include sourcePath",
        path: ["sourcePath"],
      });
    }
  });

export type CreateStorageVolumeCommandInput = z.output<
  typeof createStorageVolumeCommandInputSchema
>;
