import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const retryOperatorWorkCommandInputSchema = z.object({
  workId: nonEmptyTrimmedString("Work id"),
  reason: nonEmptyTrimmedString("Reason").optional(),
});

export type RetryOperatorWorkCommandInput = z.input<typeof retryOperatorWorkCommandInputSchema>;
export type RetryOperatorWorkCommandPayload = z.output<typeof retryOperatorWorkCommandInputSchema>;
