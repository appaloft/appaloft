import { ok, type Result } from "@appaloft/core";
import { type RepositoryContext } from "./execution-context";
import {
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptDeliveryCandidateFilter,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptListFilter,
  type ProcessAttemptPruneInput,
  type ProcessAttemptPruneResult,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type ProcessAttemptRecoveryRecorder,
  type ProcessAttemptRetryCandidateFilter,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerationInput,
  type ProcessAttemptRetryGenerationResult,
  type ProcessAttemptRetryGenerator,
  type RemoteStateWorkReadModel,
  type RemoteStateWorkSummary,
  type RouteRealizationWorkReadModel,
  type RouteRealizationWorkSummary,
  type SourceLinkReadModel,
  type SourceLinkRecord,
} from "./ports";

export class NoopProcessAttemptRecorder implements ProcessAttemptRecorder {
  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }
}

export class NoopProcessAttemptRecoveryRecorder implements ProcessAttemptRecoveryRecorder {
  async markRecovered(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async deadLetter(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async cancel(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async retry(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async prune(
    _context: RepositoryContext,
    _input: ProcessAttemptPruneInput,
  ): Promise<Result<ProcessAttemptPruneResult>> {
    return ok({
      matchedCount: 0,
      prunedCount: 0,
      countsByStatus: {},
    });
  }
}

export class EmptyProcessAttemptReadModel implements ProcessAttemptReadModel {
  async list(
    _context: RepositoryContext,
    _filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]> {
    return [];
  }

  async findOne(_context: RepositoryContext, _id: string): Promise<ProcessAttemptRecord | null> {
    return null;
  }
}

export class EmptyProcessAttemptRetryCandidateReader implements ProcessAttemptRetryCandidateReader {
  async listDueRetries(
    _context: RepositoryContext,
    _filter: ProcessAttemptRetryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]> {
    return [];
  }
}

export class EmptyProcessAttemptDeliveryCandidateReader
  implements ProcessAttemptDeliveryCandidateReader
{
  async listDueDeliveryCandidates(
    _context: RepositoryContext,
    _filter: ProcessAttemptDeliveryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]> {
    return [];
  }
}

export class EmptyProcessAttemptRetryGenerator implements ProcessAttemptRetryGenerator {
  async generateDueRetry(
    _context: RepositoryContext,
    input: ProcessAttemptRetryGenerationInput,
  ): Promise<Result<ProcessAttemptRetryGenerationResult>> {
    return ok({
      status: "not-found",
      sourceAttemptId: input.sourceAttemptId,
    });
  }
}

export class EmptyProcessAttemptClaimer implements ProcessAttemptClaimer {
  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    return ok({
      status: "not-found",
      attemptId: input.attemptId,
    });
  }
}

export class EmptyProcessAttemptCompleter implements ProcessAttemptCompleter {
  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    return ok({
      status: "not-found",
      attemptId: input.attemptId,
    });
  }
}

export class EmptySourceLinkReadModel implements SourceLinkReadModel {
  async list(): Promise<SourceLinkRecord[]> {
    return [];
  }
}

export class EmptyRouteRealizationWorkReadModel implements RouteRealizationWorkReadModel {
  async list(): Promise<RouteRealizationWorkSummary[]> {
    return [];
  }
}

export class EmptyRemoteStateWorkReadModel implements RemoteStateWorkReadModel {
  async list(): Promise<RemoteStateWorkSummary[]> {
    return [];
  }
}
