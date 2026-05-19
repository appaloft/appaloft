import { z } from "zod";

import { actionDeploymentTrustedContextSchema, nonEmptyTrimmedString } from "../shared-schema";

export const cleanupPreviewCommandInputSchema = z
  .object({
    sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
    trustedContext: actionDeploymentTrustedContextSchema.optional(),
  })
  .strict();

export type CleanupPreviewCommandInput = z.input<typeof cleanupPreviewCommandInputSchema>;
