import { z } from "zod";

export const retryDomainBindingVerificationCommandInputSchema = z.object({
  domainBindingId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export type RetryDomainBindingVerificationCommandInput = z.input<
  typeof retryDomainBindingVerificationCommandInputSchema
>;
