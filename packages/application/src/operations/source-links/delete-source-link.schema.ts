import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteSourceLinkCommandInputSchema = z.object({
  sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
  reason: nonEmptyTrimmedString("Reason").optional(),
});

export type DeleteSourceLinkCommandInput = z.input<typeof deleteSourceLinkCommandInputSchema>;
export type DeleteSourceLinkCommandPayload = z.output<typeof deleteSourceLinkCommandInputSchema>;
