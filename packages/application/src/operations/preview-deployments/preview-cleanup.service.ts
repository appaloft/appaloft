import {
  domainError,
  err,
  ok,
  PreviewEnvironmentByIdSpec,
  PreviewEnvironmentId,
  ResourceId,
  type Result,
  UpdatedAt,
  UpsertPreviewEnvironmentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type PreviewEnvironmentCleaner,
  type PreviewEnvironmentCleanerResult,
  type PreviewEnvironmentRepository,
} from "../../ports";
import { tokens } from "../../tokens";

export interface CleanupPreviewEnvironmentInput {
  previewEnvironmentId: string;
  resourceId: string;
}

export type CleanupPreviewEnvironmentStatus = "cleaned" | "already-clean";

export interface CleanupPreviewEnvironmentResult extends PreviewEnvironmentCleanerResult {
  status: CleanupPreviewEnvironmentStatus;
  previewEnvironmentId: string;
  resourceId: string;
  sourceBindingFingerprint: string;
  previewEnvironmentStatus: "cleanup-requested";
}

function cleanupStatus(result: PreviewEnvironmentCleanerResult): CleanupPreviewEnvironmentStatus {
  return result.cleanedRuntime ||
    result.removedRoute ||
    result.removedSourceLink ||
    result.removedProviderMetadata ||
    result.updatedFeedback
    ? "cleaned"
    : "already-clean";
}

@injectable()
export class PreviewEnvironmentCleanupService {
  constructor(
    @inject(tokens.previewEnvironmentRepository)
    private readonly previewEnvironmentRepository: PreviewEnvironmentRepository,
    @inject(tokens.previewEnvironmentCleaner)
    private readonly previewEnvironmentCleaner: PreviewEnvironmentCleaner,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async cleanup(
    context: ExecutionContext,
    input: CleanupPreviewEnvironmentInput,
  ): Promise<Result<CleanupPreviewEnvironmentResult>> {
    const previewEnvironmentId = PreviewEnvironmentId.create(input.previewEnvironmentId);
    if (previewEnvironmentId.isErr()) return err(previewEnvironmentId.error);

    const resourceId = ResourceId.create(input.resourceId);
    if (resourceId.isErr()) return err(resourceId.error);

    const repositoryContext = toRepositoryContext(context);
    const previewEnvironment = await this.previewEnvironmentRepository.findOne(
      repositoryContext,
      PreviewEnvironmentByIdSpec.create(previewEnvironmentId.value, resourceId.value),
    );
    if (!previewEnvironment) {
      return err(domainError.notFound("PreviewEnvironment", input.previewEnvironmentId));
    }

    if (previewEnvironment.isActive()) {
      const cleanupRequested = previewEnvironment.requestCleanup({
        requestedAt: UpdatedAt.rehydrate(this.clock.now()),
      });
      if (cleanupRequested.isErr()) return err(cleanupRequested.error);

      await this.previewEnvironmentRepository.upsert(
        repositoryContext,
        previewEnvironment,
        UpsertPreviewEnvironmentSpec.fromPreviewEnvironment(previewEnvironment),
      );
    }

    const state = previewEnvironment.toState();
    const cleanerResult = await this.previewEnvironmentCleaner.cleanup(context, {
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
      sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
      provider: state.provider.value,
      repositoryFullName: state.source.repositoryFullName.value,
      pullRequestNumber: state.source.pullRequestNumber.value,
    });
    if (cleanerResult.isErr()) return err(cleanerResult.error);

    return ok({
      status: cleanupStatus(cleanerResult.value),
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
      sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
      previewEnvironmentStatus: "cleanup-requested",
      ...cleanerResult.value,
    });
  }
}
