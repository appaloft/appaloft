import {
  err,
  ok,
  PreviewEnvironmentBySourceScopeSpec,
  PreviewEnvironmentProviderValue,
  PreviewPullRequestNumber,
  ResourceId,
  type Result,
  SourceRepositoryFullName,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type GitHubPreviewPullRequestWebhookEvent,
  type PreviewEnvironmentRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type CleanupPreviewEnvironmentResult,
  type PreviewEnvironmentCleanupService,
} from "./preview-cleanup.service";
import {
  type PreviewDeploymentProcessManager,
  type PreviewDeploymentProcessResult,
} from "./preview-deployment-process.manager";
import { type PreviewLifecycleDeployResult } from "./preview-lifecycle.service";
import { type PreviewPolicyEvaluationInput } from "./preview-policy.schema";

export interface PreviewPullRequestEventIngestInput {
  sourceEventId: string;
  event: GitHubPreviewPullRequestWebhookEvent;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  sourceBindingFingerprint: string;
  requestedSecretScopes?: string[];
  activePreviewCount?: number;
  policy?: PreviewPolicyEvaluationInput["policy"];
  expiresAt?: string;
}

export type PreviewPullRequestEventIngestResult =
  | {
      status: "routed";
      lifecycleResult: PreviewLifecycleDeployResult;
      feedbackResult?: PreviewDeploymentProcessResult["feedbackResult"];
    }
  | {
      status: "ignored";
      reason: "preview-environment-not-found";
    }
  | {
      status: "cleanup-routed";
      cleanupResult: CleanupPreviewEnvironmentResult;
    };

@injectable()
export class PreviewPullRequestEventIngestService {
  constructor(
    @inject(tokens.previewDeploymentProcessManager)
    private readonly previewDeploymentProcessManager: PreviewDeploymentProcessManager,
    @inject(tokens.previewEnvironmentRepository)
    private readonly previewEnvironmentRepository: PreviewEnvironmentRepository,
    @inject(tokens.previewEnvironmentCleanupService)
    private readonly previewEnvironmentCleanupService: PreviewEnvironmentCleanupService,
  ) {}

  async ingest(
    context: ExecutionContext,
    input: PreviewPullRequestEventIngestInput,
  ): Promise<Result<PreviewPullRequestEventIngestResult>> {
    if (input.event.eventAction === "closed") {
      return this.cleanupClosedPullRequest(context, input);
    }

    const processResult = await this.previewDeploymentProcessManager.processPullRequestEvent(
      context,
      {
        sourceEventId: input.sourceEventId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        resourceId: input.resourceId,
        serverId: input.serverId,
        destinationId: input.destinationId,
        sourceBindingFingerprint: input.sourceBindingFingerprint,
        provider: input.event.provider,
        eventKind: input.event.eventKind,
        eventAction: input.event.eventAction,
        repositoryFullName: input.event.repositoryFullName,
        headRepositoryFullName: input.event.headRepositoryFullName,
        pullRequestNumber: input.event.pullRequestNumber,
        headSha: input.event.headSha,
        baseRef: input.event.baseRef,
        verified: input.event.verified,
        ...(input.requestedSecretScopes
          ? { requestedSecretScopes: input.requestedSecretScopes }
          : {}),
        ...(input.activePreviewCount !== undefined
          ? { activePreviewCount: input.activePreviewCount }
          : {}),
        ...(input.policy ? { policy: input.policy } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    );
    return processResult.map((result) => ({
      status: "routed",
      lifecycleResult: result.lifecycleResult,
      ...(result.feedbackResult ? { feedbackResult: result.feedbackResult } : {}),
    }));
  }

  private async cleanupClosedPullRequest(
    context: ExecutionContext,
    input: PreviewPullRequestEventIngestInput,
  ): Promise<Result<PreviewPullRequestEventIngestResult>> {
    const repositoryFullName = SourceRepositoryFullName.create(input.event.repositoryFullName);
    if (repositoryFullName.isErr()) return err(repositoryFullName.error);

    const pullRequestNumber = PreviewPullRequestNumber.create(input.event.pullRequestNumber);
    if (pullRequestNumber.isErr()) return err(pullRequestNumber.error);

    const resourceId = ResourceId.create(input.resourceId);
    if (resourceId.isErr()) return err(resourceId.error);

    const previewEnvironment = await this.previewEnvironmentRepository.findOne(
      toRepositoryContext(context),
      PreviewEnvironmentBySourceScopeSpec.create({
        provider: PreviewEnvironmentProviderValue.github(),
        repositoryFullName: repositoryFullName.value,
        pullRequestNumber: pullRequestNumber.value,
        resourceId: resourceId.value,
      }),
    );

    if (!previewEnvironment) {
      return ok({
        status: "ignored",
        reason: "preview-environment-not-found",
      });
    }

    const state = previewEnvironment.toState();
    const cleanup = await this.previewEnvironmentCleanupService.cleanup(context, {
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
    });

    return cleanup.map((cleanupResult) => ({
      status: "cleanup-routed",
      cleanupResult,
    }));
  }
}
