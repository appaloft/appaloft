import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const showSourceEventQueryInputSchema = z.object({
  sourceEventId: nonEmptyTrimmedString("Source event id"),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});

export type ShowSourceEventQueryInput = z.input<typeof showSourceEventQueryInputSchema>;
export type ShowSourceEventQueryPayload = z.output<typeof showSourceEventQueryInputSchema>;
