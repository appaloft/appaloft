import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowPreviewEnvironmentResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ShowPreviewEnvironmentQueryInput,
  showPreviewEnvironmentQueryInputSchema,
} from "./show-preview-environment.schema";

export {
  type ShowPreviewEnvironmentQueryInput,
  showPreviewEnvironmentQueryInputSchema,
} from "./show-preview-environment.schema";

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
