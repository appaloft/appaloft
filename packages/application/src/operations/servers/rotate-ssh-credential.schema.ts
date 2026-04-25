import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNullableNonEmptyString = z.string().trim().min(1).nullable().optional();

export const rotateSshCredentialCommandInputSchema = z.object({
  credentialId: nonEmptyTrimmedString("SSH credential id"),
  privateKey: nonEmptyTrimmedString("SSH private key"),
  publicKey: optionalNullableNonEmptyString,
  username: optionalNullableNonEmptyString,
  confirmation: z.object({
    credentialId: nonEmptyTrimmedString("Confirmation SSH credential id"),
    acknowledgeServerUsage: z.boolean().optional(),
  }),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type RotateSshCredentialCommandInput = z.input<typeof rotateSshCredentialCommandInputSchema>;
export type RotateSshCredentialCommandPayload = z.output<
  typeof rotateSshCredentialCommandInputSchema
>;
