import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import {
  sourceEventIdentitySchema,
  sourceEventKindSchema,
  sourceEventSourceKindSchema,
  verifiedSourceEventVerificationSchema,
} from "./source-event-schemas";

export const ingestSourceEventCommandInputSchema = z.object({
  sourceKind: sourceEventSourceKindSchema,
  eventKind: sourceEventKindSchema,
  sourceIdentity: sourceEventIdentitySchema,
  ref: nonEmptyTrimmedString("Source ref"),
  revision: nonEmptyTrimmedString("Source revision"),
  deliveryId: nonEmptyTrimmedString("Delivery id").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  verification: verifiedSourceEventVerificationSchema,
  receivedAt: nonEmptyTrimmedString("Received timestamp").optional(),
});

export type IngestSourceEventCommandInput = z.input<typeof ingestSourceEventCommandInputSchema>;
export type IngestSourceEventCommandPayload = z.output<typeof ingestSourceEventCommandInputSchema>;
