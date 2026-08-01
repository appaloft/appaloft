import { z } from "zod";

export const deleteDomainBindingCommandInputSchema = z
  .object({
    domainBindingId: z.string().min(1),
    confirmation: z
      .object({
        domainBindingId: z.string().min(1),
      })
      .strict(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict();

export type DeleteDomainBindingCommandInput = z.input<typeof deleteDomainBindingCommandInputSchema>;
export type DeleteDomainBindingCommandPayload = z.output<
  typeof deleteDomainBindingCommandInputSchema
>;
