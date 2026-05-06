import {
  type CleanupPreviewUseCase,
  type ExecutionContext,
  type PreviewEnvironmentCleaner,
  type PreviewEnvironmentCleanerInput,
  type PreviewEnvironmentCleanerResult,
  tokens,
} from "@appaloft/application";
import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

@injectable()
export class ShellPreviewEnvironmentCleaner implements PreviewEnvironmentCleaner {
  constructor(
    @inject(tokens.cleanupPreviewUseCase)
    private readonly cleanupPreviewUseCase: Pick<CleanupPreviewUseCase, "execute">,
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

    return ok({
      cleanedRuntime: result.value.cleanedRuntime,
      removedRoute: result.value.removedServerAppliedRoute,
      removedSourceLink: result.value.removedSourceLink,
      removedProviderMetadata: false,
      updatedFeedback: false,
    });
  }
}
