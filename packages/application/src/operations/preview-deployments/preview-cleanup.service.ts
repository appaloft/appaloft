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
  type IdGenerator,
  type PreviewCleanupAttemptRecorder,
  type PreviewEnvironmentCleaner,
  type PreviewEnvironmentCleanerResult,
  type PreviewEnvironmentRepository,
} from "../../ports";
import { tokens } from "../../tokens";

export interface CleanupPreviewEnvironmentInput {
  previewEnvironmentId: string;
  resourceId: string;
}

export type CleanupPreviewEnvironmentStatus =
  | "cleaned"
  | "already-clean"
  | "retry-scheduled"
  | "failed";

export interface CleanupPreviewEnvironmentResult extends PreviewEnvironmentCleanerResult {
  status: CleanupPreviewEnvironmentStatus;
  attemptId: string;
  previewEnvironmentId: string;
  resourceId: string;
  sourceBindingFingerprint: string;
  previewEnvironmentStatus: "cleanup-requested";
  errorCode?: string;
  retryable?: boolean;
  failurePhase?: string;
  nextRetryAt?: string;
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

function nextRetryAt(at: string): string {
  return new Date(Date.parse(at) + 5 * 60 * 1000).toISOString();
}

function failurePhase(errorDetails: Record<string, unknown> | undefined): string {
  return typeof errorDetails?.phase === "string" ? errorDetails.phase : "preview-cleanup-retry";
}

@injectable()
export class PreviewEnvironmentCleanupService {
  constructor(
    @inject(tokens.previewEnvironmentRepository)
    private readonly previewEnvironmentRepository: PreviewEnvironmentRepository,
    @inject(tokens.previewEnvironmentCleaner)
    private readonly previewEnvironmentCleaner: PreviewEnvironmentCleaner,
    @inject(tokens.previewCleanupAttemptRecorder)
    private readonly previewCleanupAttemptRecorder: PreviewCleanupAttemptRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
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
    const attemptedAt = this.clock.now();
    const attemptId = this.idGenerator.next("pcln");
    const previewEnvironment = await this.previewEnvironmentRepository.findOne(
      repositoryContext,
      PreviewEnvironmentByIdSpec.create(previewEnvironmentId.value, resourceId.value),
    );
    if (!previewEnvironment) {
      return err(domainError.notFound("PreviewEnvironment", input.previewEnvironmentId));
    }

    if (previewEnvironment.isActive()) {
      const cleanupRequested = previewEnvironment.requestCleanup({
        requestedAt: UpdatedAt.rehydrate(attemptedAt),
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
    if (cleanerResult.isErr()) {
      const phase = failurePhase(cleanerResult.error.details);
      const retryable = cleanerResult.error.retryable;
      const retryAt = retryable ? nextRetryAt(attemptedAt) : undefined;
      await this.previewCleanupAttemptRecorder.record(repositoryContext, {
        attemptId,
        previewEnvironmentId: state.id.value,
        resourceId: state.resourceId.value,
        sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
        owner: context.actor?.id ?? context.requestId,
        status: retryable ? "retry-scheduled" : "failed",
        phase,
        attemptedAt,
        updatedAt: attemptedAt,
        errorCode: cleanerResult.error.code,
        retryable,
        ...(retryAt ? { nextRetryAt: retryAt } : {}),
      });

      return ok({
        status: retryable ? "retry-scheduled" : "failed",
        attemptId,
        previewEnvironmentId: state.id.value,
        resourceId: state.resourceId.value,
        sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
        previewEnvironmentStatus: "cleanup-requested",
        cleanedRuntime: false,
        removedRoute: false,
        removedSourceLink: false,
        removedProviderMetadata: false,
        updatedFeedback: false,
        errorCode: cleanerResult.error.code,
        retryable,
        failurePhase: phase,
        ...(retryAt ? { nextRetryAt: retryAt } : {}),
      });
    }

    await this.previewCleanupAttemptRecorder.record(repositoryContext, {
      attemptId,
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
      sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
      owner: context.actor?.id ?? context.requestId,
      status: "succeeded",
      phase: "preview-cleanup",
      attemptedAt,
      updatedAt: attemptedAt,
    });

    return ok({
      status: cleanupStatus(cleanerResult.value),
      attemptId,
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
      sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
      previewEnvironmentStatus: "cleanup-requested",
      ...cleanerResult.value,
    });
  }
}
