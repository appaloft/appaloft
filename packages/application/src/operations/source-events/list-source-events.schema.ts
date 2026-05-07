import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { sourceEventSourceKindSchema, sourceEventStatusSchema } from "./source-event-schemas";

export const listSourceEventsQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  status: sourceEventStatusSchema.optional(),
  sourceKind: sourceEventSourceKindSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
  cursor: nonEmptyTrimmedString("Cursor").optional(),
});

export type ListSourceEventsQueryInput = z.input<typeof listSourceEventsQueryInputSchema>;
export type ListSourceEventsQueryPayload = z.output<typeof listSourceEventsQueryInputSchema>;
