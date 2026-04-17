import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const domainBindingOwnershipVerificationModes = ["dns", "manual"] as const;
export type DomainBindingOwnershipVerificationMode =
  (typeof domainBindingOwnershipVerificationModes)[number];

export const confirmDomainBindingOwnershipCommandInputSchema = z.object({
  domainBindingId: nonEmptyTrimmedString("Domain binding id"),
  verificationAttemptId: nonEmptyTrimmedString("Verification attempt id").optional(),
  verificationMode: z.enum(domainBindingOwnershipVerificationModes).optional(),
  confirmedBy: nonEmptyTrimmedString("Confirmed by").optional(),
  evidence: nonEmptyTrimmedString("Evidence").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type ConfirmDomainBindingOwnershipCommandInput = z.input<
  typeof confirmDomainBindingOwnershipCommandInputSchema
>;
