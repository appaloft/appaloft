import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deactivateServerCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  reason: nonEmptyTrimmedString("Deactivation reason").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type DeactivateServerCommandInput = z.input<typeof deactivateServerCommandInputSchema>;
export type DeactivateServerCommandPayload = z.output<typeof deactivateServerCommandInputSchema>;
