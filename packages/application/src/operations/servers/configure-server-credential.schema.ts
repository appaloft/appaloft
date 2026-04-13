import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const configureServerCredentialCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  credential: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("local-ssh-agent"),
      username: optionalNonEmptyString,
    }),
    z.object({
      kind: z.literal("ssh-private-key"),
      username: optionalNonEmptyString,
      publicKey: optionalNonEmptyString,
      privateKey: nonEmptyTrimmedString("SSH private key"),
    }),
  ]),
});

export type ConfigureServerCredentialCommandInput = z.input<
  typeof configureServerCredentialCommandInputSchema
>;
