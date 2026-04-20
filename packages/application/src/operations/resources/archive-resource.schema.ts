import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const archiveResourceCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  reason: nonEmptyTrimmedString("Archive reason").max(280).optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type ArchiveResourceCommandInput = z.input<typeof archiveResourceCommandInputSchema>;
export type ArchiveResourceCommandPayload = z.output<typeof archiveResourceCommandInputSchema>;
