import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { sourceEventSourceKindSchema, sourceEventStatusSchema } from "./source-event-schemas";

export const pruneSourceEventsCommandInputSchema = z.object({
  before: z.string().datetime(),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  status: sourceEventStatusSchema.optional(),
  sourceKind: sourceEventSourceKindSchema.optional(),
  dryRun: z.boolean().default(true),
});

export type PruneSourceEventsCommandInput = z.input<typeof pruneSourceEventsCommandInputSchema>;
export type PruneSourceEventsCommandPayload = z.output<typeof pruneSourceEventsCommandInputSchema>;
