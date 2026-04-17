import {
  appaloftTraceAttributes,
  type CertificateRetryCandidate,
  type CertificateRetryCandidateReader,
  createRepositorySpanName,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { rehydrateCertificateRow, resolveRepositoryExecutor } from "./shared";

function retryAttemptIsDue(input: {
  failedAt?: string;
  requestedAt: string;
  retryAfter?: string;
  now: string;
  defaultRetryDelaySeconds: number;
}): boolean {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) {
    return false;
  }

  if (input.retryAfter) {
    const retryAfterMs = Date.parse(input.retryAfter);
    return Number.isFinite(retryAfterMs) && retryAfterMs <= nowMs;
  }

  const basisMs = Date.parse(input.failedAt ?? input.requestedAt);
  if (!Number.isFinite(basisMs)) {
    return false;
  }

  return basisMs + input.defaultRetryDelaySeconds * 1000 <= nowMs;
}

export class PgCertificateRetryCandidateReader implements CertificateRetryCandidateReader {
  constructor(private readonly db: Kysely<Database>) {}

  async listDueRetries(
    context: RepositoryContext,
    input: {
      now: string;
      defaultRetryDelaySeconds: number;
      limit: number;
    },
  ): Promise<CertificateRetryCandidate[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("certificate_retry_candidate", "list_due_retries"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "certificate_retry_candidate",
        },
      },
      async () => {
        const rows = await executor.selectFrom("certificates").selectAll().execute();
        const candidates: CertificateRetryCandidate[] = [];

        for (const row of rows) {
          const certificate = rehydrateCertificateRow(row);
          const latestAttempt = certificate.attempts[certificate.attempts.length - 1];

          if (!latestAttempt || latestAttempt.status.value !== "retry_scheduled") {
            continue;
          }

          const failedAt = latestAttempt.failedAt?.value;
          const retryAfter = latestAttempt.retryAfter?.value;
          if (
            !retryAttemptIsDue({
              now: input.now,
              defaultRetryDelaySeconds: input.defaultRetryDelaySeconds,
              requestedAt: latestAttempt.requestedAt.value,
              ...(failedAt ? { failedAt } : {}),
              ...(retryAfter ? { retryAfter } : {}),
            })
          ) {
            continue;
          }

          candidates.push({
            certificateId: certificate.id.value,
            domainBindingId: certificate.domainBindingId.value,
            domainName: certificate.domainName.value,
            attemptId: latestAttempt.id.value,
            reason: latestAttempt.reason.value,
            providerKey: latestAttempt.providerKey.value,
            challengeType: latestAttempt.challengeType.value,
            requestedAt: latestAttempt.requestedAt.value,
            ...(failedAt ? { failedAt } : {}),
            ...(retryAfter ? { retryAfter } : {}),
          });

          if (candidates.length >= input.limit) {
            break;
          }
        }

        return candidates;
      },
    );
  }
}
