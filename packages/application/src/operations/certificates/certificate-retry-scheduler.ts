import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateRetryCandidate,
  type CertificateRetryCandidateReader,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type IssueOrRenewCertificateUseCase } from "./issue-or-renew-certificate.use-case";

export interface CertificateRetrySchedulerOptions {
  defaultRetryDelaySeconds?: number;
  limit?: number;
}

export interface CertificateRetrySchedulerDispatch {
  certificateId: string;
  domainBindingId: string;
  previousAttemptId: string;
  nextAttemptId: string;
}

export interface CertificateRetrySchedulerFailure {
  certificateId: string;
  domainBindingId: string;
  previousAttemptId: string;
  errorCode: string;
}

export interface CertificateRetrySchedulerResult {
  scanned: number;
  dispatched: CertificateRetrySchedulerDispatch[];
  failed: CertificateRetrySchedulerFailure[];
}

const defaultRetryDelaySeconds = 300;
const defaultLimit = 25;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function retryIdempotencyKey(candidate: CertificateRetryCandidate): string {
  return `certificates.retry:${candidate.certificateId}:${candidate.attemptId}`;
}

@injectable()
export class CertificateRetryScheduler {
  constructor(
    @inject(tokens.certificateRetryCandidateReader)
    private readonly retryCandidateReader: CertificateRetryCandidateReader,
    @inject(tokens.issueOrRenewCertificateUseCase)
    private readonly issueOrRenewCertificateUseCase: IssueOrRenewCertificateUseCase,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async run(
    context: ExecutionContext,
    options: CertificateRetrySchedulerOptions = {},
  ): Promise<Result<CertificateRetrySchedulerResult>> {
    const defaultRetryDelay = normalizePositiveInteger(
      options.defaultRetryDelaySeconds,
      defaultRetryDelaySeconds,
    );
    const limit = normalizePositiveInteger(options.limit, defaultLimit);
    const candidates = await this.retryCandidateReader.listDueRetries(
      toRepositoryContext(context),
      {
        now: this.clock.now(),
        defaultRetryDelaySeconds: defaultRetryDelay,
        limit,
      },
    );
    const dispatched: CertificateRetrySchedulerDispatch[] = [];
    const failed: CertificateRetrySchedulerFailure[] = [];

    for (const candidate of candidates) {
      const result = await this.issueOrRenewCertificateUseCase.execute(context, {
        domainBindingId: candidate.domainBindingId,
        certificateId: candidate.certificateId,
        reason: candidate.reason,
        providerKey: candidate.providerKey,
        challengeType: candidate.challengeType,
        idempotencyKey: retryIdempotencyKey(candidate),
        causationId: candidate.attemptId,
      });

      if (result.isOk()) {
        dispatched.push({
          certificateId: result.value.certificateId,
          domainBindingId: candidate.domainBindingId,
          previousAttemptId: candidate.attemptId,
          nextAttemptId: result.value.attemptId,
        });
        continue;
      }

      failed.push({
        certificateId: candidate.certificateId,
        domainBindingId: candidate.domainBindingId,
        previousAttemptId: candidate.attemptId,
        errorCode: result.error.code,
      });
      this.logger.warn("certificate_retry_scheduler.dispatch_failed", {
        certificateId: candidate.certificateId,
        domainBindingId: candidate.domainBindingId,
        attemptId: candidate.attemptId,
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
