import { z } from "zod";

import { listLimitSchema } from "../shared-schema";

export const listCertificatesQueryInputSchema = z.object({
  domainBindingId: z.string().optional(),
  limit: listLimitSchema,
});

export type ListCertificatesQueryInput = z.input<typeof listCertificatesQueryInputSchema>;
