import {
  type CertificateProviderIssueResult,
  type CertificateSecretStore,
  type Clock,
  type ExecutionContext,
  type ImportedCertificateSecretStoreInput,
  type ImportedCertificateSecretStoreResult,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Transaction } from "kysely";

import { type Database } from "../schema";

type CertificateSecretKind = "managed-bundle" | "certificate-chain" | "private-key" | "passphrase";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

function normalizeSecretMaterial(value: string): string {
  return value.trim();
}

function buildSecretRef(
  certificateId: string,
  attemptId: string,
  kind: CertificateSecretKind,
): string {
  return `appaloft+pg://certificate/${certificateId}/${attemptId}/${kind}`;
}

function storageFailure(
  message: string,
  input: {
    certificateId: string;
    attemptId: string;
    phase: "certificate-storage" | "certificate-import-storage";
    error: unknown;
  },
) {
  const details = {
    phase: input.phase,
    adapter: "persistence.pg",
    certificateId: input.certificateId,
    attemptId: input.attemptId,
    errorMessage: input.error instanceof Error ? input.error.message : String(input.error),
  };

  return input.phase === "certificate-storage"
    ? domainError.certificateStorageFailed(message, details, true)
    : domainError.certificateImportStorageFailed(message, details, true);
}

export class PgCertificateSecretStore implements CertificateSecretStore {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly clock: Clock,
  ) {}

  async store(
    context: ExecutionContext,
    material: CertificateProviderIssueResult,
  ): Promise<Result<{ secretRef: string }>> {
    void context;

    const secretRef = buildSecretRef(material.certificateId, material.attemptId, "managed-bundle");
    const timestamp = this.clock.now();

    try {
      await this.upsertRow(this.db, {
        ref: secretRef,
        certificate_id: material.certificateId,
        domain_binding_id: material.domainBindingId,
        attempt_id: material.attemptId,
        source: "managed",
        kind: "managed-bundle",
        payload: {
          certificatePem: normalizeSecretMaterial(material.certificatePem),
          privateKeyPem: normalizeSecretMaterial(material.privateKeyPem),
          ...(material.certificateChainPem
            ? {
                certificateChainPem: normalizeSecretMaterial(material.certificateChainPem),
              }
            : {}),
        },
        metadata: {
          providerKey: material.providerKey,
          domainName: material.domainName,
          issuedAt: material.issuedAt,
          expiresAt: material.expiresAt,
        },
        created_at: timestamp,
        updated_at: timestamp,
      });

      return ok({ secretRef });
    } catch (error) {
      return err(
        storageFailure("Certificate material could not be persisted", {
          certificateId: material.certificateId,
          attemptId: material.attemptId,
          phase: "certificate-storage",
          error,
        }),
      );
    }
  }

  async storeImported(
    context: ExecutionContext,
    input: ImportedCertificateSecretStoreInput,
  ): Promise<Result<ImportedCertificateSecretStoreResult>> {
    void context;

    const timestamp = this.clock.now();
    const certificateChainRef = buildSecretRef(
      input.certificateId,
      input.attemptId,
      "certificate-chain",
    );
    const privateKeyRef = buildSecretRef(input.certificateId, input.attemptId, "private-key");
    const passphraseRef = input.passphrase
      ? buildSecretRef(input.certificateId, input.attemptId, "passphrase")
      : undefined;

    try {
      await this.db.transaction().execute(async (trx) => {
        await this.upsertRow(trx, {
          ref: certificateChainRef,
          certificate_id: input.certificateId,
          domain_binding_id: input.domainBindingId,
          attempt_id: input.attemptId,
          source: "imported",
          kind: "certificate-chain",
          payload: {
            value: normalizeSecretMaterial(input.certificateChain),
          },
          metadata: {
            domainName: input.domainName,
          },
          created_at: timestamp,
          updated_at: timestamp,
        });

        await this.upsertRow(trx, {
          ref: privateKeyRef,
          certificate_id: input.certificateId,
          domain_binding_id: input.domainBindingId,
          attempt_id: input.attemptId,
          source: "imported",
          kind: "private-key",
          payload: {
            value: normalizeSecretMaterial(input.privateKey),
          },
          metadata: {
            domainName: input.domainName,
          },
          created_at: timestamp,
          updated_at: timestamp,
        });

        if (input.passphrase) {
          await this.upsertRow(trx, {
            ref: passphraseRef ?? "",
            certificate_id: input.certificateId,
            domain_binding_id: input.domainBindingId,
            attempt_id: input.attemptId,
            source: "imported",
            kind: "passphrase",
            payload: {
              value: normalizeSecretMaterial(input.passphrase),
            },
            metadata: {
              domainName: input.domainName,
            },
            created_at: timestamp,
            updated_at: timestamp,
          });
        }
      });

      return ok({
        certificateChainRef,
        privateKeyRef,
        ...(passphraseRef ? { passphraseRef } : {}),
      });
    } catch (error) {
      return err(
        storageFailure("Imported certificate material could not be persisted", {
          certificateId: input.certificateId,
          attemptId: input.attemptId,
          phase: "certificate-import-storage",
          error,
        }),
      );
    }
  }

  private async upsertRow(
    executor: DatabaseExecutor,
    row: Insertable<Database["certificate_secrets"]>,
  ): Promise<void> {
    await executor
      .insertInto("certificate_secrets")
      .values(row)
      .onConflict((conflict) =>
        conflict.column("ref").doUpdateSet({
          source: row.source,
          kind: row.kind,
          payload: row.payload,
          metadata: row.metadata,
          updated_at: row.updated_at,
        }),
      )
      .execute();
  }
}
