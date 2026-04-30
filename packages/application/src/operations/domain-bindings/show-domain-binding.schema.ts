import { z } from "zod";

export const showDomainBindingQueryInputSchema = z.object({
  domainBindingId: z.string().min(1),
});

export type ShowDomainBindingQueryInput = z.input<typeof showDomainBindingQueryInputSchema>;
