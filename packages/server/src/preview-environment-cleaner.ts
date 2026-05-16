import {
  type CleanupPreviewUseCase,
  type ExecutionContext,
  type PreviewEnvironmentCleaner,
  type PreviewEnvironmentCleanerInput,
  type PreviewEnvironmentCleanerResult,
  type PreviewFeedbackService,
  tokens,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

@injectable()
export class ShellPreviewEnvironmentCleaner implements PreviewEnvironmentCleaner {
  constructor(
    @inject(tokens.cleanupPreviewUseCase)
    private readonly cleanupPreviewUseCase: Pick<CleanupPreviewUseCase, "execute">,
    @inject(tokens.previewFeedbackService)
    private readonly previewFeedbackService: Pick<PreviewFeedbackService, "publishCleanupUpdate">,
  ) {}

  async cleanup(
    context: ExecutionContext,
    input: PreviewEnvironmentCleanerInput,
  ): Promise<Result<PreviewEnvironmentCleanerResult>> {
    const result = await this.cleanupPreviewUseCase.execute(context, {
      sourceFingerprint: input.sourceBindingFingerprint,
    });

    if (result.isErr()) {
      return err({
        ...result.error,
        details: {
          ...(result.error.details ?? {}),
          phase:
            typeof result.error.details?.phase === "string"
              ? result.error.details.phase
              : "preview-cleanup",
          previewEnvironmentId: input.previewEnvironmentId,
          resourceId: input.resourceId,
          sourceBindingFingerprint: input.sourceBindingFingerprint,
          provider: input.provider,
        },
      });
    }

    const feedback = await this.previewFeedbackService.publishCleanupUpdate(context, {
      previewEnvironmentId: input.previewEnvironmentId,
      repositoryFullName: input.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      body: [
        `Preview cleanup completed for ${input.repositoryFullName}#${input.pullRequestNumber}.`,
        `Preview environment: ${input.previewEnvironmentId}`,
      ].join("\n"),
    });

    if (feedback.isErr()) {
      return err(feedback.error);
    }

    if (feedback.value.status === "retryable-failed" || feedback.value.status === "failed") {
      return err(
        domainError.provider(
          "Preview cleanup feedback update failed",
          {
            phase: "preview-cleanup-feedback",
            previewEnvironmentId: input.previewEnvironmentId,
            resourceId: input.resourceId,
            sourceBindingFingerprint: input.sourceBindingFingerprint,
            provider: input.provider,
            errorCode: feedback.value.errorCode ?? "preview_feedback_update_failed",
          },
          feedback.value.retryable ?? feedback.value.status === "retryable-failed",
        ),
      );
    }

    return ok({
      cleanedRuntime: result.value.cleanedRuntime,
      removedRoute: result.value.removedServerAppliedRoute,
      removedSourceLink: result.value.removedSourceLink,
      removedProviderMetadata: feedback.value.removedProviderMetadata ?? false,
      updatedFeedback: feedback.value.updatedFeedback ?? feedback.value.status !== "skipped",
    });
  }
}
