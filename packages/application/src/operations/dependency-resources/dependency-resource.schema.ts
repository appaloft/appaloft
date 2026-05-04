import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const dependencyResourceBackupRelationshipInputSchema = z
  .object({
    retentionRequired: z.boolean().default(false),
    reason: nonEmptyTrimmedString("Backup relationship reason").optional(),
  })
  .optional();

export const dependencyResourceResponseSchema = z.object({
  id: z.string(),
});

export type DependencyResourceResponse = z.output<typeof dependencyResourceResponseSchema>;
