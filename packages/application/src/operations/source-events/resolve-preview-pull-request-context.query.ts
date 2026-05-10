import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ResolvePreviewPullRequestContextQueryInput,
  type ResolvePreviewPullRequestContextResponse,
  resolvePreviewPullRequestContextQueryInputSchema,
} from "./resolve-preview-pull-request-context.schema";

export {
  type ResolvePreviewPullRequestContextQueryInput,
  type ResolvePreviewPullRequestContextResponse,
  resolvePreviewPullRequestContextQueryInputSchema,
  resolvePreviewPullRequestContextResponseSchema,
} from "./resolve-preview-pull-request-context.schema";

export class ResolvePreviewPullRequestContextQuery extends Query<ResolvePreviewPullRequestContextResponse> {
  constructor(
    public readonly repositoryFullName: string,
    public readonly baseRef: string,
    public readonly providerRepositoryId?: string,
    public readonly installationId?: string,
  ) {
    super();
  }

  static create(
    input: ResolvePreviewPullRequestContextQueryInput,
  ): Result<ResolvePreviewPullRequestContextQuery> {
    return parseOperationInput(resolvePreviewPullRequestContextQueryInputSchema, input).map(
      (parsed) =>
        new ResolvePreviewPullRequestContextQuery(
          parsed.repositoryFullName,
          parsed.baseRef,
          parsed.providerRepositoryId,
          parsed.installationId,
        ),
    );
  }
}
