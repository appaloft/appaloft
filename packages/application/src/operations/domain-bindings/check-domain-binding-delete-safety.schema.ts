import { z } from "zod";

export const checkDomainBindingDeleteSafetyQueryInputSchema = z.object({
  domainBindingId: z.string().min(1),
});

export type CheckDomainBindingDeleteSafetyQueryInput = z.input<
  typeof checkDomainBindingDeleteSafetyQueryInputSchema
>;
