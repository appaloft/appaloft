import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import {
  sourceEventIdentitySchema,
  verifiedSourceEventVerificationSchema,
} from "./source-event-schemas";

export const completeSourceEventCheckCommandInputSchema = z.object({
  sourceKind: z.literal("github"),
  sourceIdentity: sourceEventIdentitySchema,
  revision: nonEmptyTrimmedString("Source revision"),
  deliveryId: nonEmptyTrimmedString("Delivery id"),
  check: z.object({
    name: nonEmptyTrimmedString("Check name").max(200),
    conclusion: z.enum([
      "success",
      "neutral",
      "skipped",
      "failure",
      "cancelled",
      "timed_out",
      "action_required",
      "stale",
      "startup_failure",
    ]),
    checkRunId: nonEmptyTrimmedString("Check run id"),
    completedAt: z.string().datetime(),
  }),
  verification: verifiedSourceEventVerificationSchema,
  receivedAt: nonEmptyTrimmedString("Received timestamp").optional(),
});

export type CompleteSourceEventCheckCommandInput = z.input<
  typeof completeSourceEventCheckCommandInputSchema
>;
export type CompleteSourceEventCheckCommandPayload = z.output<
  typeof completeSourceEventCheckCommandInputSchema
>;
