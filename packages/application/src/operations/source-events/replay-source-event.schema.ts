import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const replaySourceEventCommandInputSchema = z.object({
  sourceEventId: nonEmptyTrimmedString("Source event id"),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type ReplaySourceEventCommandInput = z.input<typeof replaySourceEventCommandInputSchema>;
export type ReplaySourceEventCommandPayload = z.output<typeof replaySourceEventCommandInputSchema>;
