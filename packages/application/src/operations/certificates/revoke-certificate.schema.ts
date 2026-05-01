import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const revokeCertificateCommandInputSchema = z.object({
  certificateId: nonEmptyTrimmedString("Certificate id"),
  reason: z.string().optional(),
  idempotencyKey: z.string().optional(),
  causationId: z.string().optional(),
});

export type RevokeCertificateCommandInput = z.input<typeof revokeCertificateCommandInputSchema>;
