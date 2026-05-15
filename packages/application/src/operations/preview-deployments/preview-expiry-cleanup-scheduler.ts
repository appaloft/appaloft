import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type PreviewExpiredEnvironmentCandidate,
  type PreviewExpiredEnvironmentCandidateReader,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type CleanupPreviewEnvironmentStatus,
  type PreviewEnvironmentCleanupService,
} from "./preview-cleanup.service";

export interface PreviewExpiryCleanupSchedulerOptions {
  limit?: number;
}

export interface PreviewExpiryCleanupSchedulerDispatch {
  previewEnvironmentId: string;
  resourceId: string;
  expiresAt: string;
  attemptId: string;
  status: CleanupPreviewEnvironmentStatus;
}

export interface PreviewExpiryCleanupSchedulerFailure {
  previewEnvironmentId: string;
  resourceId: string;
  expiresAt: string;
  errorCode: string;
}

export interface PreviewExpiryCleanupSchedulerResult {
  scanned: number;
  dispatched: PreviewExpiryCleanupSchedulerDispatch[];
  failed: PreviewExpiryCleanupSchedulerFailure[];
}

const defaultLimit = 25;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function expiryLogContext(candidate: PreviewExpiredEnvironmentCandidate): Record<string, unknown> {
  return {
    previewEnvironmentId: candidate.previewEnvironmentId,
    resourceId: candidate.resourceId,
    expiresAt: candidate.expiresAt,
  };
}

@injectable()
export class PreviewExpiryCleanupScheduler {
  constructor(
    @inject(tokens.previewExpiredEnvironmentCandidateReader)
    private readonly expiredCandidateReader: PreviewExpiredEnvironmentCandidateReader,
    @inject(tokens.previewEnvironmentCleanupService)
    private readonly cleanupService: PreviewEnvironmentCleanupService,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async run(
    context: ExecutionContext,
    options: PreviewExpiryCleanupSchedulerOptions = {},
  ): Promise<Result<PreviewExpiryCleanupSchedulerResult>> {
    const limit = normalizePositiveInteger(options.limit, defaultLimit);
    const candidates = await this.expiredCandidateReader.listExpiredActive(
      toRepositoryContext(context),
      {
        now: this.clock.now(),
        limit,
      },
    );
    const dispatched: PreviewExpiryCleanupSchedulerDispatch[] = [];
    const failed: PreviewExpiryCleanupSchedulerFailure[] = [];

    for (const candidate of candidates) {
      const result = await this.cleanupService.cleanup(context, {
        previewEnvironmentId: candidate.previewEnvironmentId,
        resourceId: candidate.resourceId,
      });

      if (result.isOk()) {
        dispatched.push({
          previewEnvironmentId: candidate.previewEnvironmentId,
          resourceId: candidate.resourceId,
          expiresAt: candidate.expiresAt,
          attemptId: result.value.attemptId,
          status: result.value.status,
        });
        continue;
      }

      failed.push({
        previewEnvironmentId: candidate.previewEnvironmentId,
        resourceId: candidate.resourceId,
        expiresAt: candidate.expiresAt,
        errorCode: result.error.code,
      });
      this.logger.warn("preview_expiry_cleanup_scheduler.dispatch_failed", {
        ...expiryLogContext(candidate),
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
