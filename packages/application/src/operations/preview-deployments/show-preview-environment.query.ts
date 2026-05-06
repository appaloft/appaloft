import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ShowPreviewEnvironmentResult } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";

export const showPreviewEnvironmentQueryInputSchema = z.object({
  previewEnvironmentId: nonEmptyTrimmedString("Preview environment id"),
  projectId: nonEmptyTrimmedString("Project id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});

export type ShowPreviewEnvironmentQueryInput = z.input<
  typeof showPreviewEnvironmentQueryInputSchema
>;

export class ShowPreviewEnvironmentQuery extends Query<ShowPreviewEnvironmentResult> {
  constructor(
    public readonly previewEnvironmentId: string,
    public readonly projectId?: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(input: ShowPreviewEnvironmentQueryInput): Result<ShowPreviewEnvironmentQuery> {
    return parseOperationInput(showPreviewEnvironmentQueryInputSchema, input).map(
      (parsed) =>
        new ShowPreviewEnvironmentQuery(
          parsed.previewEnvironmentId,
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
        ),
    );
  }
}
