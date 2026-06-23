import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type PreviewEnvironmentReadModel,
  type PreviewEnvironmentSummary,
  type PreviewPolicyDecisionReadModel,
} from "../../ports";
import { tokens } from "../../tokens";

export interface PreviewOperableRuntimeScope {
  previewEnvironment: PreviewEnvironmentSummary;
  resourceId: string;
  serverId: string;
  destinationId: string;
  deploymentId?: string;
}

export interface ResolvePreviewOperableScopeInput {
  previewEnvironmentId?: string | undefined;
  resourceId?: string | undefined;
  deploymentId?: string | undefined;
  requireDeployment?: boolean | undefined;
}

@injectable()
export class PreviewOperableScopeResolver {
  constructor(
    @inject(tokens.previewEnvironmentReadModel)
    private readonly previewEnvironmentReadModel: PreviewEnvironmentReadModel,
    @inject(tokens.previewPolicyDecisionReadModel)
    private readonly previewPolicyDecisionReadModel: PreviewPolicyDecisionReadModel,
  ) {}

  async resolve(
    context: ExecutionContext,
    input: ResolvePreviewOperableScopeInput,
  ): Promise<Result<PreviewOperableRuntimeScope | null>> {
    if (!input.previewEnvironmentId) {
      return ok(null);
    }

    const repositoryContext = toRepositoryContext(context);
    const previewEnvironment = await this.previewEnvironmentReadModel.findOne(repositoryContext, {
      previewEnvironmentId: input.previewEnvironmentId,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    });

    if (!previewEnvironment) {
      return err(domainError.notFound("preview_environment", input.previewEnvironmentId));
    }

    const decision = await this.previewPolicyDecisionReadModel.findLatestForPreviewEnvironment(
      repositoryContext,
      {
        previewEnvironmentId: input.previewEnvironmentId,
        resourceId: previewEnvironment.resourceId,
      },
    );
    const deploymentId = input.deploymentId ?? decision?.deploymentId;

    if (input.requireDeployment && !deploymentId) {
      return err(
        domainError.validation("Preview environment has no safe deployment context", {
          phase: "preview-operable-scope-resolution",
          previewEnvironmentId: input.previewEnvironmentId,
          resourceId: previewEnvironment.resourceId,
        }),
      );
    }

    return ok({
      previewEnvironment,
      resourceId: previewEnvironment.resourceId,
      serverId: previewEnvironment.serverId,
      destinationId: previewEnvironment.destinationId,
      ...(deploymentId ? { deploymentId } : {}),
    });
  }
}
