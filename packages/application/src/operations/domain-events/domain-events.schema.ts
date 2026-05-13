import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const pruneDomainEventsCommandInputSchema = z.object({
  before: z.string().datetime(),
  eventType: nonEmptyTrimmedString("Event type").optional(),
  aggregateId: nonEmptyTrimmedString("Aggregate id").optional(),
  aggregateType: nonEmptyTrimmedString("Aggregate type").optional(),
  deploymentId: nonEmptyTrimmedString("Deployment id").optional(),
  limit: z.coerce.number().int().positive().max(10_000).optional(),
  dryRun: z.boolean().default(true),
});

export type PruneDomainEventsCommandInput = z.input<typeof pruneDomainEventsCommandInputSchema>;
