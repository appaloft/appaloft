import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListPreviewEnvironmentsResult,
  type PreviewEnvironmentReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListPreviewEnvironmentsQuery } from "./list-preview-environments.query";

@injectable()
export class ListPreviewEnvironmentsQueryService {
  constructor(
    @inject(tokens.previewEnvironmentReadModel)
    private readonly previewEnvironmentReadModel: PreviewEnvironmentReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListPreviewEnvironmentsQuery,
  ): Promise<Result<ListPreviewEnvironmentsResult>> {
    if (!query.projectId && !query.resourceId) {
      return err(
        domainError.validation("Preview environment list requires project or Resource scope", {
          phase: "preview-environment-read",
          requiredScopeKind: "project-or-resource",
        }),
      );
    }

    const page = await this.previewEnvironmentReadModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.environmentId ? { environmentId: query.environmentId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.repositoryFullName ? { repositoryFullName: query.repositoryFullName } : {}),
      ...(query.pullRequestNumber ? { pullRequestNumber: query.pullRequestNumber } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return ok({
      schemaVersion: "preview-environments.list/v1",
      ...page,
      generatedAt: this.clock.now(),
    });
  }
}
