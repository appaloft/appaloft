import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const listSourceLinksQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type ListSourceLinksQueryInput = z.input<typeof listSourceLinksQueryInputSchema>;
export type ListSourceLinksQueryPayload = z.output<typeof listSourceLinksQueryInputSchema>;
