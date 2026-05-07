import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const queryLimitSchema = z
  .union([
    z.number().int().positive().max(100),
    z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform((value) => Number(value))
      .pipe(z.number().int().positive().max(100)),
  ])
  .optional();

export const listPreviewEnvironmentsQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  status: z.enum(["active", "cleanup-requested"]).optional(),
  repositoryFullName: nonEmptyTrimmedString("Repository full name").optional(),
  pullRequestNumber: z.number().int().positive().optional(),
  limit: queryLimitSchema,
  cursor: nonEmptyTrimmedString("Cursor").optional(),
});

export type ListPreviewEnvironmentsQueryInput = z.input<
  typeof listPreviewEnvironmentsQueryInputSchema
>;
export type ListPreviewEnvironmentsQueryPayload = z.output<
  typeof listPreviewEnvironmentsQueryInputSchema
>;
