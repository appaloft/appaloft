import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type PreviewCleanupRetryCandidate,
  type PreviewCleanupRetryCandidateReader,
} from "../../ports";
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

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function retryLogContext(candidate: PreviewCleanupRetryCandidate): Record<string, unknown> {
  return {
    previewEnvironmentId: candidate.previewEnvironmentId,
    resourceId: candidate.resourceId,
    attemptId: candidate.attemptId,
    phase: candidate.phase,
  };
}

@injectable()
export class PreviewCleanupRetryScheduler {
  constructor(
    @inject(tokens.previewCleanupRetryCandidateReader)
    private readonly retryCandidateReader: PreviewCleanupRetryCandidateReader,
    @inject(tokens.previewEnvironmentCleanupService)
    private readonly cleanupService: PreviewEnvironmentCleanupService,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async run(
    context: ExecutionContext,
    options: PreviewCleanupRetrySchedulerOptions = {},
  ): Promise<Result<PreviewCleanupRetrySchedulerResult>> {
    const limit = normalizePositiveInteger(options.limit, defaultLimit);
    const candidates = await this.retryCandidateReader.listDueRetries(
      toRepositoryContext(context),
      {
        now: this.clock.now(),
        limit,
      },
    );
    const dispatched: PreviewCleanupRetrySchedulerDispatch[] = [];
    const failed: PreviewCleanupRetrySchedulerFailure[] = [];

    for (const candidate of candidates) {
      const result = await this.cleanupService.cleanup(context, {
        previewEnvironmentId: candidate.previewEnvironmentId,
        resourceId: candidate.resourceId,
      });

      if (result.isOk()) {
        dispatched.push({
          previewEnvironmentId: candidate.previewEnvironmentId,
          resourceId: candidate.resourceId,
          previousAttemptId: candidate.attemptId,
          nextAttemptId: result.value.attemptId,
          status: result.value.status,
        });
        continue;
      }

      failed.push({
        previewEnvironmentId: candidate.previewEnvironmentId,
        resourceId: candidate.resourceId,
        previousAttemptId: candidate.attemptId,
        errorCode: result.error.code,
      });
      this.logger.warn("preview_cleanup_retry_scheduler.dispatch_failed", {
        ...retryLogContext(candidate),
        errorCode: result.error.code,
      });
    }

    return ok({
      scanned: candidates.length,
      dispatched,
      failed,
    });
  }
}
