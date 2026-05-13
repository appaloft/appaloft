import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const cancelOperatorWorkCommandInputSchema = z.object({
  workId: nonEmptyTrimmedString("Work id"),
  reason: nonEmptyTrimmedString("Reason"),
});

export type CancelOperatorWorkCommandInput = z.input<typeof cancelOperatorWorkCommandInputSchema>;
export type CancelOperatorWorkCommandPayload = z.output<
  typeof cancelOperatorWorkCommandInputSchema
>;
