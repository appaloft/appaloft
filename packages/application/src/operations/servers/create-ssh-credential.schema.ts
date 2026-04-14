import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const createSshCredentialCommandInputSchema = z.object({
  name: nonEmptyTrimmedString("SSH credential name"),
  kind: z.literal("ssh-private-key"),
  username: optionalNonEmptyString,
  publicKey: optionalNonEmptyString,
  privateKey: nonEmptyTrimmedString("SSH private key"),
});

export type CreateSshCredentialCommandInput = z.input<typeof createSshCredentialCommandInputSchema>;
