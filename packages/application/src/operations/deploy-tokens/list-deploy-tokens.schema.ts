import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const listDeployTokensQueryInputSchema = z.object({
  organizationId: nonEmptyTrimmedString("Organization id"),
  status: z.enum(["active", "revoked"]).optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  repositoryFullName: nonEmptyTrimmedString("Repository full name").optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export type ListDeployTokensQueryInput = z.input<typeof listDeployTokensQueryInputSchema>;
