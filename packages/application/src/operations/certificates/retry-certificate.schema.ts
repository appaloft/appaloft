import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const retryCertificateCommandInputSchema = z.object({
  certificateId: nonEmptyTrimmedString("Certificate id"),
  idempotencyKey: z.string().optional(),
  causationId: z.string().optional(),
});

export type RetryCertificateCommandInput = z.input<typeof retryCertificateCommandInputSchema>;
