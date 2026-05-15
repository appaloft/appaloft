import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type IdGenerator,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptRecord,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerator,
} from "../../ports";
import {
  EmptyProcessAttemptDeliveryCandidateReader,
  EmptyProcessAttemptRetryCandidateReader,
  EmptyProcessAttemptRetryGenerator,
} from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import {
  type CleanupPreviewEnvironmentStatus,
  type PreviewEnvironmentCleanupService,
} from "./preview-cleanup.service";

export interface PreviewCleanupRetrySchedulerOptions {
  limit?: number;
}

export interface PreviewCleanupRetrySchedulerDispatch {
  previewEnvironmentId: string;
  resourceId: string;
  previousAttemptId: string;
  nextAttemptId: string;
  status: CleanupPreviewEnvironmentStatus;
}

export interface PreviewCleanupRetrySchedulerFailure {
  previewEnvironmentId: string;
  resourceId: string;
  previousAttemptId: string;
  errorCode: string;
}

export interface PreviewCleanupRetrySchedulerResult {
  scanned: number;
  dispatched: PreviewCleanupRetrySchedulerDispatch[];
  failed: PreviewCleanupRetrySchedulerFailure[];
}

const defaultLimit = 25;
const previewCleanupOperationKeys = ["preview-environments.delete", "deployments.cleanup-preview"];
const previewCleanupRetryWorkerId = "preview-cleanup-retry-scheduler";
const previewCleanupProcessKind = "system";

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function safeString(
  candidate: ProcessAttemptRecord,
  key: "previewEnvironmentId" | "resourceId" | "retryOfWorkId",
): string | undefined {
  const value = candidate.safeDetails?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function candidatePreviewEnvironmentId(candidate: ProcessAttemptRecord): string | undefined {
  return safeString(candidate, "previewEnvironmentId");
}

function candidateResourceId(candidate: ProcessAttemptRecord): string | undefined {
  return safeString(candidate, "resourceId") ?? candidate.resourceId;
}

function candidatePreviousAttemptId(candidate: ProcessAttemptRecord): string {
  return safeString(candidate, "retryOfWorkId") ?? candidate.id;
}

function retryLogContext(candidate: ProcessAttemptRecord): Record<string, unknown> {
  return {
    previewEnvironmentId: candidatePreviewEnvironmentId(candidate),
    resourceId: candidateResourceId(candidate),
    attemptId: candidate.id,
    phase: candidate.phase,
  };
}

@injectable()
export class PreviewCleanupRetryScheduler {
  constructor(
    @inject(tokens.previewEnvironmentCleanupService)
    private readonly cleanupService: PreviewEnvironmentCleanupService,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.processAttemptRetryCandidateReader)
    private readonly processAttemptRetryCandidateReader: ProcessAttemptRetryCandidateReader = new EmptyProcessAttemptRetryCandidateReader(),
    @inject(tokens.processAttemptDeliveryCandidateReader)
    private readonly processAttemptDeliveryCandidateReader: ProcessAttemptDeliveryCandidateReader = new EmptyProcessAttemptDeliveryCandidateReader(),
    @inject(tokens.processAttemptRetryGenerator)
    private readonly processAttemptRetryGenerator: ProcessAttemptRetryGenerator = new EmptyProcessAttemptRetryGenerator(),
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator = {
      next(prefix: string): string {
        return `${prefix}_retry`;
      },
    },
  ) {}

  async run(
    context: ExecutionContext,
    options: PreviewCleanupRetrySchedulerOptions = {},
  ): Promise<Result<PreviewCleanupRetrySchedulerResult>> {
    const limit = normalizePositiveInteger(options.limit, defaultLimit);
    const now = this.clock.now();
    const repositoryContext = toRepositoryContext(context);
    const dispatched: PreviewCleanupRetrySchedulerDispatch[] = [];
    const failed: PreviewCleanupRetrySchedulerFailure[] = [];
    const retryCandidates = await this.processAttemptRetryCandidateReader.listDueRetries(
      repositoryContext,
      {
        kind: previewCleanupProcessKind,
        now,
        limit,
      },
    );
    const generatedRetryAttempts: ProcessAttemptRecord[] = [];

    for (const retryCandidate of retryCandidates) {
      if (!previewCleanupOperationKeys.includes(retryCandidate.operationKey)) {
        continue;
      }

      const generated = await this.processAttemptRetryGenerator.generateDueRetry(
        repositoryContext,
        {
          sourceAttemptId: retryCandidate.id,
          retryAttemptId: this.idGenerator.next("pcln"),
          generatedAt: now,
          phase: "preview-cleanup-retry",
          step: "queued",
          safeDetails: {
            generatedBy: previewCleanupRetryWorkerId,
          },
        },
      );

      if (generated.isErr()) {
        failed.push({
          previewEnvironmentId: candidatePreviewEnvironmentId(retryCandidate) ?? "",
          resourceId: candidateResourceId(retryCandidate) ?? "",
          previousAttemptId: retryCandidate.id,
          errorCode: generated.error.code,
        });
        this.logger.warn("preview_cleanup_retry_scheduler.retry_generation_failed", {
          ...retryLogContext(retryCandidate),
          errorCode: generated.error.code,
        });
        continue;
      }

      if (generated.value.status === "generated") {
        generatedRetryAttempts.push(generated.value.retryAttempt);
        continue;
      }

      this.logger.warn("preview_cleanup_retry_scheduler.retry_generation_skipped", {
        ...retryLogContext(retryCandidate),
        status: generated.value.status,
      });
    }

    const queriedDeliveryCandidates: ProcessAttemptRecord[] = [];
    for (const operationKey of previewCleanupOperationKeys) {
      queriedDeliveryCandidates.push(
        ...(await this.processAttemptDeliveryCandidateReader.listDueDeliveryCandidates(
          repositoryContext,
          {
            kind: previewCleanupProcessKind,
            operationKey,
            now,
            limit,
          },
        )),
      );
    }
    const candidatesById = new Map<string, ProcessAttemptRecord>();
    for (const candidate of [
      ...generatedRetryAttempts,
      ...queriedDeliveryCandidates.filter((candidate) => candidate.status === "pending"),
    ]) {
      candidatesById.set(candidate.id, candidate);
    }
    const candidates = [...candidatesById.values()];

    for (const candidate of candidates) {
      const previewEnvironmentId = candidatePreviewEnvironmentId(candidate);
      const resourceId = candidateResourceId(candidate);
      if (!previewEnvironmentId || !resourceId) {
        failed.push({
          previewEnvironmentId: previewEnvironmentId ?? "",
          resourceId: resourceId ?? "",
          previousAttemptId: candidatePreviousAttemptId(candidate),
          errorCode: "preview_cleanup_retry_candidate_invalid",
        });
        this.logger.warn("preview_cleanup_retry_scheduler.candidate_skipped", {
          ...retryLogContext(candidate),
          reason: "missing-preview-environment-or-resource",
        });
        continue;
      }

      const result = await this.cleanupService.cleanup(context, {
        previewEnvironmentId,
        resourceId,
        processAttemptId: candidate.id,
        workerId: previewCleanupRetryWorkerId,
      });

      if (result.isOk()) {
        dispatched.push({
          previewEnvironmentId,
          resourceId,
          previousAttemptId: candidatePreviousAttemptId(candidate),
          nextAttemptId: result.value.attemptId,
          status: result.value.status,
        });
        continue;
      }

      failed.push({
        previewEnvironmentId,
        resourceId,
        previousAttemptId: candidatePreviousAttemptId(candidate),
        errorCode: result.error.code,
      });
      this.logger.warn("preview_cleanup_retry_scheduler.dispatch_failed", {
        ...retryLogContext(candidate),
        errorCode: result.error.code,
      });
    }

    return ok({
      scanned: retryCandidates.length + queriedDeliveryCandidates.length,
      dispatched,
      failed,
    });
  }
}
