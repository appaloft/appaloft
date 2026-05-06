import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type GitHubPreviewPullRequestWebhookEvent } from "../../ports";
import { tokens } from "../../tokens";
import {
  type PreviewLifecycleDeployResult,
  type PreviewLifecycleService,
} from "./preview-lifecycle.service";
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
    }
  | {
      status: "ignored";
      reason: "preview-cleanup-not-implemented";
    };

@injectable()
export class PreviewPullRequestEventIngestService {
  constructor(
    @inject(tokens.previewLifecycleService)
    private readonly previewLifecycleService: PreviewLifecycleService,
  ) {}

  async ingest(
    context: ExecutionContext,
    input: PreviewPullRequestEventIngestInput,
  ): Promise<Result<PreviewPullRequestEventIngestResult>> {
    if (input.event.eventAction === "closed") {
      return ok({
        status: "ignored",
        reason: "preview-cleanup-not-implemented",
      });
    }

    const lifecycleResult = await this.previewLifecycleService.deployFromPolicyEligibleEvent(
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
    return lifecycleResult.map((result) => ({
      status: "routed",
      lifecycleResult: result,
    }));
  }
}
