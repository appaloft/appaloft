import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ListPreviewEnvironmentsResult } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";

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

export class ListPreviewEnvironmentsQuery extends Query<ListPreviewEnvironmentsResult> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly resourceId?: string,
    public readonly status?: ListPreviewEnvironmentsQueryPayload["status"],
    public readonly repositoryFullName?: string,
    public readonly pullRequestNumber?: number,
    public readonly limit?: number,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(
    input: ListPreviewEnvironmentsQueryInput = {},
  ): Result<ListPreviewEnvironmentsQuery> {
    return parseOperationInput(listPreviewEnvironmentsQueryInputSchema, input).map(
      (parsed) =>
        new ListPreviewEnvironmentsQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.environmentId),
          trimToUndefined(parsed.resourceId),
          parsed.status,
          trimToUndefined(parsed.repositoryFullName),
          parsed.pullRequestNumber,
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
