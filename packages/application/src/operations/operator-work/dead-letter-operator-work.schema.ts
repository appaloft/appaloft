import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const deadLetterOperatorWorkCommandInputSchema = z.object({
  workId: nonEmptyTrimmedString("Work id"),
  reason: nonEmptyTrimmedString("Reason"),
});

export type DeadLetterOperatorWorkCommandInput = z.input<
  typeof deadLetterOperatorWorkCommandInputSchema
>;
export type DeadLetterOperatorWorkCommandPayload = z.output<
  typeof deadLetterOperatorWorkCommandInputSchema
>;
