import { z } from "zod";

export const configureDomainBindingCertificatePolicyCommandInputSchema = z
  .object({
    domainBindingId: z.string().min(1),
    certificatePolicy: z.enum(["auto", "manual"]),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict();

export type ConfigureDomainBindingCertificatePolicyCommandInput = z.input<
  typeof configureDomainBindingCertificatePolicyCommandInputSchema
>;
