import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteResourceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  confirmation: z.object({
    resourceSlug: nonEmptyTrimmedString("Resource slug"),
  }),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type DeleteResourceCommandInput = z.input<typeof deleteResourceCommandInputSchema>;
export type DeleteResourceCommandPayload = z.output<typeof deleteResourceCommandInputSchema>;
