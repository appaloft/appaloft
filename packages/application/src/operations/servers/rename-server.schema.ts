import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const renameServerCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  name: nonEmptyTrimmedString("Server name"),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type RenameServerCommandInput = z.input<typeof renameServerCommandInputSchema>;
export type RenameServerCommandPayload = z.output<typeof renameServerCommandInputSchema>;
