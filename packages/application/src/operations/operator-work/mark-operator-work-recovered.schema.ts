import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const markOperatorWorkRecoveredCommandInputSchema = z.object({
  workId: nonEmptyTrimmedString("Work id"),
  reason: nonEmptyTrimmedString("Reason").optional(),
});

export type MarkOperatorWorkRecoveredCommandInput = z.input<
  typeof markOperatorWorkRecoveredCommandInputSchema
>;
export type MarkOperatorWorkRecoveredCommandPayload = z.output<
  typeof markOperatorWorkRecoveredCommandInputSchema
>;
