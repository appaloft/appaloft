import { z } from "zod";

export const configureDomainBindingRouteCommandInputSchema = z.object({
  domainBindingId: z.string().min(1),
  redirectTo: z.string().min(1).optional(),
  redirectStatus: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export type ConfigureDomainBindingRouteCommandInput = z.input<
  typeof configureDomainBindingRouteCommandInputSchema
>;
