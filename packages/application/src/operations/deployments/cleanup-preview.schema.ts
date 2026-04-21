import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const cleanupPreviewCommandInputSchema = z
  .object({
    sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
  })
  .strict();

export type CleanupPreviewCommandInput = z.input<typeof cleanupPreviewCommandInputSchema>;
