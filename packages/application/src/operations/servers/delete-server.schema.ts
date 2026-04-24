import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteServerCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  confirmation: z.object({
    serverId: nonEmptyTrimmedString("Confirmation server id"),
  }),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type DeleteServerCommandInput = z.input<typeof deleteServerCommandInputSchema>;
export type DeleteServerCommandPayload = z.output<typeof deleteServerCommandInputSchema>;
