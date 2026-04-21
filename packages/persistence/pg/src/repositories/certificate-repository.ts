import {
  appaloftTraceAttributes,
  type CertificateRepository,
  createRepositorySpanName,
  type RepositoryContext,
} from "@appaloft/application";
import {
  Certificate,
  CertificateByAttemptIdempotencyKeySpec,
  type CertificateByDomainBindingIdSpec,
  type CertificateByIdSpec,
  type CertificateMutationSpec,
  type CertificateMutationSpecVisitor,
  type CertificateSelectionSpec,
  type CertificateSelectionSpecVisitor,
  type UpsertCertificateSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  rehydrateCertificateRow,
  resolveRepositoryExecutor,
  serializeCertificateAttempts,
} from "./shared";

type CertificateSelectionQuery = SelectQueryBuilder<
  Database,
  "certificates",
  Selectable<Database["certificates"]>
>;

class KyselyCertificateSelectionVisitor
  implements CertificateSelectionSpecVisitor<CertificateSelectionQuery>
{
  visitCertificateById(
    query: CertificateSelectionQuery,
    spec: CertificateByIdSpec,
  ): CertificateSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitCertificateByDomainBindingId(
    query: CertificateSelectionQuery,
    spec: CertificateByDomainBindingIdSpec,
  ): CertificateSelectionQuery {
    return query.where("domain_binding_id", "=", spec.domainBindingId.value);
  }

  visitCertificateByAttemptIdempotencyKey(
    query: CertificateSelectionQuery,
    spec: CertificateByAttemptIdempotencyKeySpec,
  ): CertificateSelectionQuery {
    void spec;
    return query;
  }
}

class KyselyCertificateMutationVisitor
  implements
    CertificateMutationSpecVisitor<{
      values: Insertable<Database["certificates"]>;
    }>
{
  visitUpsertCertificate(spec: UpsertCertificateSpec) {
    return {
      values: {
        id: spec.state.id.value,
        domain_binding_id: spec.state.domainBindingId.value,
        domain_name: spec.state.domainName.value,
        status: spec.state.status.value,
        source: spec.state.source.value,
        provider_key: spec.state.providerKey.value,
        challenge_type: spec.state.challengeType.value,
        issued_at: spec.state.issuedAt?.value ?? null,
        expires_at: spec.state.expiresAt?.value ?? null,
        fingerprint: spec.state.fingerprint?.value ?? null,
        secret_ref: spec.state.secretRef?.value ?? null,
        safe_metadata: spec.state.importedMetadata
          ? {
              subjectAlternativeNames: spec.state.importedMetadata.subjectAlternativeNames.map(
                (domainName) => domainName.value,
              ),
              notBefore: spec.state.importedMetadata.notBefore.value,
              keyAlgorithm: spec.state.importedMetadata.keyAlgorithm.value,
              ...(spec.state.importedMetadata.issuer
                ? { issuer: spec.state.importedMetadata.issuer.value }
                : {}),
            }
          : {},
        secret_refs: spec.state.importedSecretRefs
          ? {
              certificateChain: spec.state.importedSecretRefs.certificateChain.value,
              privateKey: spec.state.importedSecretRefs.privateKey.value,
              ...(spec.state.importedSecretRefs.passphrase
                ? { passphrase: spec.state.importedSecretRefs.passphrase.value }
                : {}),
            }
          : {},
        attempts: serializeCertificateAttempts(spec.state.attempts),
        created_at: spec.state.createdAt.value,
      },
    };
  }
}

export class PgCertificateRepository implements CertificateRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    certificate: Certificate,
    spec: CertificateMutationSpec,
  ): Promise<void> {
    void certificate;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyCertificateMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("certificate", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "certificate",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("certificates")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              domain_binding_id: mutation.values.domain_binding_id,
              domain_name: mutation.values.domain_name,
              status: mutation.values.status,
              source: mutation.values.source,
              provider_key: mutation.values.provider_key,
              challenge_type: mutation.values.challenge_type,
              issued_at: mutation.values.issued_at,
              expires_at: mutation.values.expires_at,
              fingerprint: mutation.values.fingerprint,
              secret_ref: mutation.values.secret_ref,
              safe_metadata: mutation.values.safe_metadata,
              secret_refs: mutation.values.secret_refs,
              attempts: mutation.values.attempts,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: CertificateSelectionSpec,
  ): Promise<Certificate | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("certificate", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "certificate",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const rows = await spec
          .accept(
            executor.selectFrom("certificates").selectAll(),
            new KyselyCertificateSelectionVisitor(),
          )
          .execute();

        const row =
          spec instanceof CertificateByAttemptIdempotencyKeySpec
            ? rows.find((candidate) =>
                Certificate.rehydrate(rehydrateCertificateRow(candidate))
                  .toState()
                  .attempts.some(
                    (attempt) => attempt.idempotencyKey?.value === spec.idempotencyKey,
                  ),
              )
            : rows[0];

        return row ? Certificate.rehydrate(rehydrateCertificateRow(row)) : null;
      },
    );
  }
}
