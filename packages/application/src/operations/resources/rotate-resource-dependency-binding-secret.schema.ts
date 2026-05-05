import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const rotateResourceDependencyBindingSecretCommandInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    bindingId: nonEmptyTrimmedString("Resource dependency binding id"),
    secretRef: nonEmptyTrimmedString("Secret reference").optional(),
    secretValue: nonEmptyTrimmedString("Secret value").optional(),
    confirmHistoricalSnapshotsRemainUnchanged: z.literal(true),
  })
  .superRefine((input, context) => {
    const suppliedSecretInputs = [input.secretRef, input.secretValue].filter(Boolean).length;
    if (suppliedSecretInputs !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of secretRef or secretValue is required",
        path: ["secretRef"],
      });
    }
  });

export type RotateResourceDependencyBindingSecretCommandInput = z.output<
  typeof rotateResourceDependencyBindingSecretCommandInputSchema
>;
