import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteSshCredentialCommandInputSchema = z.object({
  credentialId: nonEmptyTrimmedString("SSH credential id"),
  confirmation: z.object({
    credentialId: nonEmptyTrimmedString("Confirmation SSH credential id"),
  }),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type DeleteSshCredentialCommandInput = z.input<typeof deleteSshCredentialCommandInputSchema>;
export type DeleteSshCredentialCommandPayload = z.output<
  typeof deleteSshCredentialCommandInputSchema
>;
