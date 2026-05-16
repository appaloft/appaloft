import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const showSourceLinkQueryInputSchema = z.object({
  sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
});

export type ShowSourceLinkQueryInput = z.input<typeof showSourceLinkQueryInputSchema>;
export type ShowSourceLinkQueryPayload = z.output<typeof showSourceLinkQueryInputSchema>;
