import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type PreviewEnvironmentReadModel,
  type ShowPreviewEnvironmentResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowPreviewEnvironmentQuery } from "./show-preview-environment.query";

@injectable()
export class ShowPreviewEnvironmentQueryService {
  constructor(
    @inject(tokens.previewEnvironmentReadModel)
    private readonly previewEnvironmentReadModel: PreviewEnvironmentReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowPreviewEnvironmentQuery,
  ): Promise<Result<ShowPreviewEnvironmentResult>> {
    if (!query.projectId && !query.resourceId) {
      return err(
        domainError.validation("Preview environment detail requires project or Resource scope", {
          phase: "preview-environment-read",
          previewEnvironmentId: query.previewEnvironmentId,
          requiredScopeKind: "project-or-resource",
        }),
      );
    }

    const previewEnvironment = await this.previewEnvironmentReadModel.findOne(
      toRepositoryContext(context),
      {
        previewEnvironmentId: query.previewEnvironmentId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      },
    );
    if (!previewEnvironment) {
      return err(domainError.notFound("PreviewEnvironment", query.previewEnvironmentId));
    }

    return ok({
      schemaVersion: "preview-environments.show/v1",
      previewEnvironment,
      generatedAt: this.clock.now(),
    });
  }
}
