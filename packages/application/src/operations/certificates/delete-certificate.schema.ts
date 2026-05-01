import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteCertificateCommandInputSchema = z.object({
  certificateId: nonEmptyTrimmedString("Certificate id"),
  confirmation: z.object({
    certificateId: nonEmptyTrimmedString("Certificate id confirmation"),
  }),
  causationId: z.string().optional(),
});

export type DeleteCertificateCommandInput = z.input<typeof deleteCertificateCommandInputSchema>;
export type DeleteCertificateCommandPayload = z.output<typeof deleteCertificateCommandInputSchema>;
