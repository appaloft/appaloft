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
  scopeResourceId: nonEmptyTrimmedString("Scope Resource id").optional(),
  sourceIdentity: sourceEventIdentitySchema,
  ref: nonEmptyTrimmedString("Source ref"),
  revision: nonEmptyTrimmedString("Source revision"),
  beforeRevision: nonEmptyTrimmedString("Source before revision").optional(),
  refChangeKind: z.enum(["created", "updated", "deleted"]).optional(),
  forced: z.boolean().optional(),
  providerConnectionId: nonEmptyTrimmedString("Provider connection id").optional(),
  deliveryId: nonEmptyTrimmedString("Delivery id").optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  verification: verifiedSourceEventVerificationSchema,
  receivedAt: nonEmptyTrimmedString("Received timestamp").optional(),
});

export type IngestSourceEventCommandInput = z.input<typeof ingestSourceEventCommandInputSchema>;
export type IngestSourceEventCommandPayload = z.output<typeof ingestSourceEventCommandInputSchema>;
