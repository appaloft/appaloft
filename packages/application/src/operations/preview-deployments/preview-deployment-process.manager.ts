import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type PreviewFeedbackService,
  type PublishPreviewFeedbackResult,
} from "./preview-feedback.service";
import {
  type PreviewLifecycleDeployInput,
  type PreviewLifecycleDeployResult,
  type PreviewLifecycleService,
} from "./preview-lifecycle.service";

export interface PreviewDeploymentProcessInput extends PreviewLifecycleDeployInput {
  feedbackChannel?: "github-pr-comment";
}

export interface PreviewDeploymentProcessResult {
  lifecycleResult: PreviewLifecycleDeployResult;
  feedbackResult?: PublishPreviewFeedbackResult;
  deploymentStatusFeedbackResult?: PublishPreviewFeedbackResult;
}

function feedbackKey(input: PreviewDeploymentProcessInput): string {
  return `feedback:${input.sourceEventId}:github-pr-comment`;
}

function deploymentStatusFeedbackKey(input: PreviewDeploymentProcessInput): string {
  return `feedback:${input.sourceEventId}:github-deployment-status`;
}

function feedbackBody(
  input: PreviewDeploymentProcessInput,
  lifecycleResult: PreviewLifecycleDeployResult,
): string {
  const lines = [
    `Preview deployment accepted for ${input.repositoryFullName}#${input.pullRequestNumber}.`,
  ];

  if (lifecycleResult.previewEnvironmentId) {
    lines.push(`Preview environment: ${lifecycleResult.previewEnvironmentId}`);
  }

  if (lifecycleResult.deploymentId) {
    lines.push(`Deployment: ${lifecycleResult.deploymentId}`);
  }

  return lines.join("\n");
}

@injectable()
export class PreviewDeploymentProcessManager {
  constructor(
    @inject(tokens.previewLifecycleService)
    private readonly previewLifecycleService: PreviewLifecycleService,
    @inject(tokens.previewFeedbackService)
    private readonly previewFeedbackService: PreviewFeedbackService,
  ) {}

  async processPullRequestEvent(
    context: ExecutionContext,
    input: PreviewDeploymentProcessInput,
  ): Promise<Result<PreviewDeploymentProcessResult>> {
    const lifecycle = await this.previewLifecycleService.deployFromPolicyEligibleEvent(
      context,
      input,
    );
    if (lifecycle.isErr()) {
      return err(lifecycle.error);
    }

    if (
      lifecycle.value.status !== "dispatched" ||
      !lifecycle.value.previewEnvironmentId ||
      !lifecycle.value.deploymentId
    ) {
      return ok({ lifecycleResult: lifecycle.value });
    }

    const feedback = await this.previewFeedbackService.publish(context, {
      feedbackKey: feedbackKey(input),
      sourceEventId: input.sourceEventId,
      previewEnvironmentId: lifecycle.value.previewEnvironmentId,
      channel: input.feedbackChannel ?? "github-pr-comment",
      repositoryFullName: input.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      body: feedbackBody(input, lifecycle.value),
    });
    if (feedback.isErr()) {
      return err(feedback.error);
    }

    const deploymentStatusFeedback = await this.previewFeedbackService.publish(context, {
      feedbackKey: deploymentStatusFeedbackKey(input),
      sourceEventId: input.sourceEventId,
      previewEnvironmentId: lifecycle.value.previewEnvironmentId,
      channel: "github-deployment-status",
      repositoryFullName: input.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      body: feedbackBody(input, lifecycle.value),
    });
    if (deploymentStatusFeedback.isErr()) {
      return err(deploymentStatusFeedback.error);
    }

    return ok({
      lifecycleResult: lifecycle.value,
      feedbackResult: feedback.value,
      deploymentStatusFeedbackResult: deploymentStatusFeedback.value,
    });
  }
}
