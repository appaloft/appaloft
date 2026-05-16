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
import { injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type PreviewCleanupAttemptRecorder,
  type PreviewEnvironmentCleaner,
  type PreviewEnvironmentCleanerResult,
  type PreviewEnvironmentRepository,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptRecorder,
} from "../../ports";
import {
  EmptyProcessAttemptClaimer,
  EmptyProcessAttemptCompleter,
  NoopProcessAttemptRecorder,
} from "../../process-attempt-journal";

export interface CleanupPreviewEnvironmentInput {
  previewEnvironmentId: string;
  resourceId: string;
  processAttemptId?: string;
  workerId?: string;
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

function cleanupProcessDedupeKey(input: {
  previewEnvironmentId: string;
  resourceId: string;
  sourceBindingFingerprint: string;
}): string {
  return [
    "preview-cleanup",
    input.previewEnvironmentId,
    input.resourceId,
    input.sourceBindingFingerprint,
  ].join(":");
}

@injectable()
export class PreviewEnvironmentCleanupService {
  constructor(
    private readonly previewEnvironmentRepository: PreviewEnvironmentRepository,
    private readonly previewEnvironmentCleaner: PreviewEnvironmentCleaner,
    private readonly previewCleanupAttemptRecorder: PreviewCleanupAttemptRecorder,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
    private readonly processAttemptClaimer: ProcessAttemptClaimer = new EmptyProcessAttemptClaimer(),
    private readonly processAttemptCompleter: ProcessAttemptCompleter = new EmptyProcessAttemptCompleter(),
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
    const attemptId = input.processAttemptId ?? this.idGenerator.next("pcln");
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
    const stateDetails = {
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
      sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
      provider: state.provider.value,
      repositoryFullName: state.source.repositoryFullName.value,
      pullRequestNumber: state.source.pullRequestNumber.value,
    };

    if (input.processAttemptId) {
      const claimResult = await this.processAttemptClaimer.claimDue(repositoryContext, {
        attemptId: input.processAttemptId,
        workerId: input.workerId ?? "preview-cleanup-retry-scheduler",
        claimedAt: attemptedAt,
        safeDetails: stateDetails,
      });
      if (claimResult.isErr()) return err(claimResult.error);

      if (claimResult.value.status !== "claimed") {
        return err(
          domainError.conflict("Preview cleanup process attempt could not be claimed", {
            phase: "preview-cleanup-retry",
            processAttemptId: input.processAttemptId,
            claimStatus: claimResult.value.status,
            previewEnvironmentId: state.id.value,
            resourceId: state.resourceId.value,
          }),
        );
      }
    }

    const cleanerResult = await this.previewEnvironmentCleaner.cleanup(context, {
      previewEnvironmentId: stateDetails.previewEnvironmentId,
      resourceId: stateDetails.resourceId,
      sourceBindingFingerprint: stateDetails.sourceBindingFingerprint,
      provider: stateDetails.provider,
      repositoryFullName: stateDetails.repositoryFullName,
      pullRequestNumber: stateDetails.pullRequestNumber,
    });
    if (cleanerResult.isErr()) {
      const phase = failurePhase(cleanerResult.error.details);
      const retryable = cleanerResult.error.retryable;
      const retryAt = retryable ? nextRetryAt(attemptedAt) : undefined;
      await this.previewCleanupAttemptRecorder.record(repositoryContext, {
        attemptId,
        previewEnvironmentId: stateDetails.previewEnvironmentId,
        resourceId: stateDetails.resourceId,
        sourceBindingFingerprint: stateDetails.sourceBindingFingerprint,
        owner: context.actor?.id ?? context.requestId,
        status: retryable ? "retry-scheduled" : "failed",
        phase,
        attemptedAt,
        updatedAt: attemptedAt,
        errorCode: cleanerResult.error.code,
        retryable,
        ...(retryAt ? { nextRetryAt: retryAt } : {}),
      });
      if (input.processAttemptId) {
        const completed = await this.processAttemptCompleter.complete(repositoryContext, {
          attemptId: input.processAttemptId,
          status: retryable ? "retry-scheduled" : "failed",
          completedAt: attemptedAt,
          phase,
          step: "cleanup-failed",
          errorCode: cleanerResult.error.code,
          errorCategory: cleanerResult.error.category,
          retriable: retryable,
          ...(retryAt ? { nextEligibleAt: retryAt } : {}),
          nextActions: retryable ? ["retry", "manual-review"] : ["manual-review"],
          safeDetails: stateDetails,
        });
        if (completed.isErr()) return err(completed.error);
        if (completed.value.status !== "completed") {
          return err(
            domainError.conflict("Preview cleanup process attempt could not be completed", {
              phase: "preview-cleanup-retry",
              processAttemptId: input.processAttemptId,
              completionStatus: completed.value.status,
            }),
          );
        }
      } else {
        await this.processAttemptRecorder.record(repositoryContext, {
          id: attemptId,
          kind: "system",
          status: retryable ? "retry-scheduled" : "failed",
          operationKey: "preview-environments.delete",
          dedupeKey: cleanupProcessDedupeKey(stateDetails),
          correlationId: context.requestId,
          requestId: context.requestId,
          phase,
          step: "cleanup-failed",
          resourceId: stateDetails.resourceId,
          startedAt: attemptedAt,
          updatedAt: attemptedAt,
          ...(retryable ? {} : { finishedAt: attemptedAt }),
          errorCode: cleanerResult.error.code,
          errorCategory: cleanerResult.error.category,
          retriable: retryable,
          ...(retryAt ? { nextEligibleAt: retryAt } : {}),
          nextActions: retryable ? ["retry", "manual-review"] : ["manual-review"],
          safeDetails: stateDetails,
        });
      }

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

    const cleanupDetails = {
      previewEnvironmentId: state.id.value,
      resourceId: state.resourceId.value,
      sourceBindingFingerprint: state.source.sourceBindingFingerprint.value,
      provider: state.provider.value,
      repositoryFullName: state.source.repositoryFullName.value,
      pullRequestNumber: state.source.pullRequestNumber.value,
      cleanedRuntime: cleanerResult.value.cleanedRuntime,
      removedRoute: cleanerResult.value.removedRoute,
      removedSourceLink: cleanerResult.value.removedSourceLink,
      removedProviderMetadata: cleanerResult.value.removedProviderMetadata,
      updatedFeedback: cleanerResult.value.updatedFeedback,
    };

    await this.previewCleanupAttemptRecorder.record(repositoryContext, {
      attemptId,
      previewEnvironmentId: cleanupDetails.previewEnvironmentId,
      resourceId: cleanupDetails.resourceId,
      sourceBindingFingerprint: cleanupDetails.sourceBindingFingerprint,
      owner: context.actor?.id ?? context.requestId,
      status: "succeeded",
      phase: "preview-cleanup",
      attemptedAt,
      updatedAt: attemptedAt,
    });
    if (input.processAttemptId) {
      const completed = await this.processAttemptCompleter.complete(repositoryContext, {
        attemptId: input.processAttemptId,
        status: "succeeded",
        completedAt: attemptedAt,
        phase: "preview-cleanup",
        step: "cleanup-completed",
        nextActions: ["no-action"],
        safeDetails: cleanupDetails,
      });
      if (completed.isErr()) return err(completed.error);
      if (completed.value.status !== "completed") {
        return err(
          domainError.conflict("Preview cleanup process attempt could not be completed", {
            phase: "preview-cleanup-retry",
            processAttemptId: input.processAttemptId,
            completionStatus: completed.value.status,
          }),
        );
      }
    } else {
      await this.processAttemptRecorder.record(repositoryContext, {
        id: attemptId,
        kind: "system",
        status: "succeeded",
        operationKey: "preview-environments.delete",
        dedupeKey: cleanupProcessDedupeKey(cleanupDetails),
        correlationId: context.requestId,
        requestId: context.requestId,
        phase: "preview-cleanup",
        step: "cleanup-completed",
        resourceId: cleanupDetails.resourceId,
        startedAt: attemptedAt,
        updatedAt: attemptedAt,
        finishedAt: attemptedAt,
        nextActions: ["no-action"],
        safeDetails: cleanupDetails,
      });
    }

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
