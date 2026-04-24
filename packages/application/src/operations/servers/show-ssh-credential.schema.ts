import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

export const showSshCredentialQueryInputSchema = z.object({
  credentialId: nonEmptyTrimmedString("SSH credential id"),
  includeUsage: booleanInput(true),
});

export type ShowSshCredentialQueryInput = z.input<typeof showSshCredentialQueryInputSchema>;
export type ShowSshCredentialQueryParsedInput = z.output<typeof showSshCredentialQueryInputSchema>;
