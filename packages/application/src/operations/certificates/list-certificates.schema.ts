import { z } from "zod";

export const listCertificatesQueryInputSchema = z.object({
  domainBindingId: z.string().optional(),
});

export type ListCertificatesQueryInput = z.input<typeof listCertificatesQueryInputSchema>;
