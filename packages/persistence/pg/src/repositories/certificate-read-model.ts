import {
  appaloftTraceAttributes,
  type CertificateReadModel,
  type CertificateSummary,
  createReadModelSpanName,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryExecutor,
  type SerializedCertificateAttempt,
  type SerializedImportedCertificateMetadata,
} from "./shared";

export class PgCertificateReadModel implements CertificateReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: {
      domainBindingId?: string;
    },
  ): Promise<CertificateSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("certificate", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "certificate",
        },
      },
      async () => {
        let query = executor.selectFrom("certificates").selectAll().orderBy("created_at", "desc");

        if (input?.domainBindingId) {
          query = query.where("domain_binding_id", "=", input.domainBindingId);
        }

        const rows = await query.execute();
        return rows.map((row): CertificateSummary => {
          const attempts = (row.attempts ?? []) as unknown as SerializedCertificateAttempt[];
          const safeMetadata = (row.safe_metadata ?? {}) as SerializedImportedCertificateMetadata;
          const latestAttempt = attempts[attempts.length - 1];

          return {
            id: row.id,
            domainBindingId: row.domain_binding_id,
            domainName: row.domain_name,
            status: row.status as CertificateSummary["status"],
            source: row.source as CertificateSummary["source"],
            providerKey: row.provider_key,
            challengeType: row.challenge_type,
            ...(row.issued_at
              ? { issuedAt: normalizeTimestamp(row.issued_at) ?? row.issued_at }
              : {}),
            ...(row.expires_at
              ? { expiresAt: normalizeTimestamp(row.expires_at) ?? row.expires_at }
              : {}),
            ...(row.fingerprint ? { fingerprint: row.fingerprint } : {}),
            ...(safeMetadata.notBefore
              ? { notBefore: normalizeTimestamp(safeMetadata.notBefore) ?? safeMetadata.notBefore }
              : {}),
            ...(safeMetadata.issuer ? { issuer: safeMetadata.issuer } : {}),
            ...(safeMetadata.keyAlgorithm ? { keyAlgorithm: safeMetadata.keyAlgorithm } : {}),
            ...(Array.isArray(safeMetadata.subjectAlternativeNames)
              ? { subjectAlternativeNames: safeMetadata.subjectAlternativeNames }
              : {}),
            ...(latestAttempt
              ? {
                  latestAttempt: {
                    id: latestAttempt.id,
                    status: latestAttempt.status,
                    reason: latestAttempt.reason,
                    providerKey: latestAttempt.providerKey,
                    challengeType: latestAttempt.challengeType,
                    requestedAt: latestAttempt.requestedAt,
                    ...(latestAttempt.issuedAt ? { issuedAt: latestAttempt.issuedAt } : {}),
                    ...(latestAttempt.expiresAt ? { expiresAt: latestAttempt.expiresAt } : {}),
                    ...(latestAttempt.failedAt ? { failedAt: latestAttempt.failedAt } : {}),
                    ...(latestAttempt.failureCode ? { errorCode: latestAttempt.failureCode } : {}),
                    ...(latestAttempt.failurePhase
                      ? { failurePhase: latestAttempt.failurePhase }
                      : {}),
                    ...(latestAttempt.failureMessage
                      ? { failureMessage: latestAttempt.failureMessage }
                      : {}),
                    ...(latestAttempt.retriable === undefined
                      ? {}
                      : { retriable: latestAttempt.retriable }),
                    ...(latestAttempt.retryAfter ? { retryAfter: latestAttempt.retryAfter } : {}),
                  },
                }
              : {}),
            createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
          };
        });
      },
    );
  }
}
