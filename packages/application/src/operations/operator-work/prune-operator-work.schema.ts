import { z } from "zod";
import { prunableProcessAttemptStatuses } from "../../ports";

export const pruneOperatorWorkCommandInputSchema = z.object({
  before: z.string().trim().datetime({ message: "Before must be an ISO datetime" }),
  statuses: z.array(z.enum(prunableProcessAttemptStatuses)).min(1).optional(),
  dryRun: z.boolean().optional(),
});

export type PruneOperatorWorkCommandInput = z.input<typeof pruneOperatorWorkCommandInputSchema>;
export type PruneOperatorWorkCommandPayload = z.output<typeof pruneOperatorWorkCommandInputSchema>;
