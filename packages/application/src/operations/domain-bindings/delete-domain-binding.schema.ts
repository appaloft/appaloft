import { z } from "zod";

export const deleteDomainBindingCommandInputSchema = z.object({
  domainBindingId: z.string().min(1),
  confirmation: z.object({
    domainBindingId: z.string().min(1),
  }),
  idempotencyKey: z.string().min(1).optional(),
});

export type DeleteDomainBindingCommandInput = z.input<typeof deleteDomainBindingCommandInputSchema>;
export type DeleteDomainBindingCommandPayload = z.output<
  typeof deleteDomainBindingCommandInputSchema
>;
