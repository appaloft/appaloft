import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const importCertificateCommandInputSchema = z.object({
  domainBindingId: nonEmptyTrimmedString("Domain binding id"),
  certificateChain: nonEmptyTrimmedString("Certificate chain"),
  privateKey: nonEmptyTrimmedString("Private key"),
  passphrase: nonEmptyTrimmedString("Passphrase").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  causationId: nonEmptyTrimmedString("Causation id").optional(),
});

export type ImportCertificateCommandInput = z.input<typeof importCertificateCommandInputSchema>;
