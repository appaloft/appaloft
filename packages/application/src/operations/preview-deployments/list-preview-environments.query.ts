import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListPreviewEnvironmentsResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListPreviewEnvironmentsQueryInput,
  type ListPreviewEnvironmentsQueryPayload,
  listPreviewEnvironmentsQueryInputSchema,
} from "./list-preview-environments.schema";

export {
  type ListPreviewEnvironmentsQueryInput,
  listPreviewEnvironmentsQueryInputSchema,
} from "./list-preview-environments.schema";

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
