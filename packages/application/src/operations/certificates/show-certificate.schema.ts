import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showCertificateQueryInputSchema = z.object({
  certificateId: nonEmptyTrimmedString("Certificate id"),
});

export type ShowCertificateQueryInput = z.input<typeof showCertificateQueryInputSchema>;
