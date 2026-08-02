import {
  type CertificateMaterializer,
  type CertificateMaterialReference,
  type CertificateProviderIssueResult,
  type CertificateSecretStore,
  type Clock,
  type ExecutionContext,
  type ImportedCertificateSecretStoreInput,
  type ImportedCertificateSecretStoreResult,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, sql, type Transaction } from "kysely";

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

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredPayloadText(
  payload: unknown,
  key: string,
  input: { certificateId: string; phase: string },
): Result<string> {
  const value = jsonRecord(payload)[key];
  return typeof value === "string" && value
    ? ok(value)
    : err(
        domainError.certificateRouteReconciliationFailed(
          "Stored certificate material is incomplete",
          {
            certificateId: input.certificateId,
            phase: input.phase,
            field: key,
          },
        ),
      );
}

export class PgCertificateSecretStore implements CertificateSecretStore, CertificateMaterializer {
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

  async materialize(
    context: ExecutionContext,
    input: CertificateMaterialReference,
  ): Promise<
    Result<{
      certificateId: string;
      certificateChain: string;
      privateKey: string;
      passphrase?: string;
    }>
  > {
    void context;
    const phase = "certificate-materialization";

    try {
      const refs = [
        input.secretRef,
        input.certificateChainRef,
        input.privateKeyRef,
        input.passphraseRef,
      ].filter((ref): ref is string => Boolean(ref));
      const rows = refs.length
        ? await this.db
            .selectFrom("certificate_secrets")
            .select(["ref", "certificate_id", "source", "kind", "payload", "metadata"])
            .where("ref", "in", refs)
            .execute()
        : [];
      const byRef = new Map(rows.map((row) => [row.ref, row]));

      const read = (ref: string | undefined, kind: CertificateSecretKind) => {
        const row = ref ? byRef.get(ref) : undefined;
        if (
          !row ||
          row.certificate_id !== input.certificateId ||
          row.source !== input.source ||
          row.kind !== kind ||
          typeof jsonRecord(row.metadata).deactivatedAt === "string"
        ) {
          return err(
            domainError.certificateRouteReconciliationFailed(
              "Stored certificate material reference is unavailable",
              { certificateId: input.certificateId, phase, kind },
            ),
          );
        }
        return ok(row.payload);
      };

      if (input.source === "managed") {
        const payload = read(input.secretRef, "managed-bundle");
        if (payload.isErr()) return err(payload.error);
        const certificatePem = requiredPayloadText(payload.value, "certificatePem", {
          certificateId: input.certificateId,
          phase,
        });
        if (certificatePem.isErr()) return err(certificatePem.error);
        const privateKey = requiredPayloadText(payload.value, "privateKeyPem", {
          certificateId: input.certificateId,
          phase,
        });
        if (privateKey.isErr()) return err(privateKey.error);
        const chain = jsonRecord(payload.value).certificateChainPem;
        return ok({
          certificateId: input.certificateId,
          certificateChain:
            typeof chain === "string" && chain
              ? `${certificatePem.value}\n${chain}`
              : certificatePem.value,
          privateKey: privateKey.value,
        });
      }

      const chainPayload = read(input.certificateChainRef, "certificate-chain");
      if (chainPayload.isErr()) return err(chainPayload.error);
      const keyPayload = read(input.privateKeyRef, "private-key");
      if (keyPayload.isErr()) return err(keyPayload.error);
      const certificateChain = requiredPayloadText(chainPayload.value, "value", {
        certificateId: input.certificateId,
        phase,
      });
      if (certificateChain.isErr()) return err(certificateChain.error);
      const privateKey = requiredPayloadText(keyPayload.value, "value", {
        certificateId: input.certificateId,
        phase,
      });
      if (privateKey.isErr()) return err(privateKey.error);

      let passphrase: string | undefined;
      if (input.passphraseRef) {
        const passphrasePayload = read(input.passphraseRef, "passphrase");
        if (passphrasePayload.isErr()) return err(passphrasePayload.error);
        const passphraseResult = requiredPayloadText(passphrasePayload.value, "value", {
          certificateId: input.certificateId,
          phase,
        });
        if (passphraseResult.isErr()) return err(passphraseResult.error);
        passphrase = passphraseResult.value;
      }

      return ok({
        certificateId: input.certificateId,
        certificateChain: certificateChain.value,
        privateKey: privateKey.value,
        ...(passphrase ? { passphrase } : {}),
      });
    } catch (error) {
      return err(
        domainError.certificateRouteReconciliationFailed(
          "Stored certificate material could not be materialized",
          {
            certificateId: input.certificateId,
            phase,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        ),
      );
    }
  }

  async deactivate(
    context: ExecutionContext,
    input: {
      certificateId: string;
      domainBindingId: string;
      reason: "revoked" | "deleted";
      deactivatedAt: string;
    },
  ): Promise<Result<void>> {
    void context;
    try {
      await this.db
        .updateTable("certificate_secrets")
        .set({
          metadata: sql`metadata || ${JSON.stringify({
            deactivatedAt: input.deactivatedAt,
            deactivationReason: input.reason,
          })}::jsonb`,
          updated_at: input.deactivatedAt,
        })
        .where("certificate_id", "=", input.certificateId)
        .where("domain_binding_id", "=", input.domainBindingId)
        .execute();

      return ok(undefined);
    } catch (error) {
      return err(
        domainError.certificateStorageFailed(
          "Certificate secret references could not be deactivated",
          {
            phase: "certificate-storage",
            adapter: "persistence.pg",
            certificateId: input.certificateId,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          true,
        ),
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
