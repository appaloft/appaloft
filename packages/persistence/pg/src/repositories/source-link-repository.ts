import {
  type SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
  type SourceLinkSelectionSpecVisitor,
  type SourceLinkUpsertSpec,
  type SourceLinkUpsertSpecVisitor,
  type UpsertSourceLinkSpec,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database, type SourceLinksTable } from "../schema";

type SourceLinkRow = Selectable<SourceLinksTable>;
type SourceLinkSelectionQuery = SelectQueryBuilder<
  Database,
  "source_links",
  Selectable<Database["source_links"]>
>;
type WhereCapableQuery<TResult> = {
  where(column: string, op: "=", value: unknown): TResult;
};

class KyselySourceLinkSelectionVisitor<TResult extends WhereCapableQuery<TResult>>
  implements SourceLinkSelectionSpecVisitor<TResult>
{
  visitSourceLinkBySourceFingerprint(
    query: TResult,
    spec: SourceLinkBySourceFingerprintSpec,
  ): TResult {
    return query.where("source_fingerprint", "=", spec.sourceFingerprint);
  }
}

class KyselySourceLinkUpsertVisitor
  implements SourceLinkUpsertSpecVisitor<{ values: Insertable<Database["source_links"]> }>
{
  visitUpsertSourceLink(spec: UpsertSourceLinkSpec) {
    return {
      values: {
        source_fingerprint: spec.record.sourceFingerprint,
        project_id: spec.record.projectId,
        environment_id: spec.record.environmentId,
        resource_id: spec.record.resourceId,
        server_id: spec.record.serverId ?? null,
        destination_id: spec.record.destinationId ?? null,
        updated_at: spec.record.updatedAt,
        reason: spec.record.reason ?? null,
        metadata: {},
      },
    };
  }
}

function validateSourceFingerprint(sourceFingerprint: string): Result<void> {
  if (!sourceFingerprint.trim()) {
    return err(
      domainError.validation("Source fingerprint is required", {
        phase: "source-link-validation",
      }),
    );
  }

  if (/\/\/[^/\s]+:[^/@\s]+@/.test(sourceFingerprint)) {
    return err(
      domainError.validation("Source fingerprint contains credential-bearing material", {
        phase: "source-link-validation",
      }),
    );
  }

  return ok(undefined);
}

function validateRecord(record: SourceLinkRecord): Result<void> {
  const fingerprintResult = validateSourceFingerprint(record.sourceFingerprint);
  if (fingerprintResult.isErr()) {
    return err(fingerprintResult.error);
  }

  if (record.destinationId && !record.serverId) {
    return err(
      domainError.validation("Destination source link requires server context", {
        phase: "source-link-admission",
        field: "serverId",
      }),
    );
  }

  return ok(undefined);
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function mapRow(row: SourceLinkRow): SourceLinkRecord {
  return {
    sourceFingerprint: row.source_fingerprint,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    updatedAt: normalizeTimestamp(row.updated_at),
    ...(row.server_id ? { serverId: row.server_id } : {}),
    ...(row.destination_id ? { destinationId: row.destination_id } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

function persistenceError(message: string, error: unknown) {
  return domainError.infra(message, {
    phase: "source-link-persistence",
    adapter: "persistence.pg",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export class PgSourceLinkRepository implements SourceLinkRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(spec: SourceLinkSelectionSpec): Promise<Result<SourceLinkRecord | null>> {
    const validation = spec.accept(ok(undefined), {
      visitSourceLinkBySourceFingerprint: (_query, sourceFingerprintSpec) =>
        validateSourceFingerprint(sourceFingerprintSpec.sourceFingerprint),
    } satisfies SourceLinkSelectionSpecVisitor<Result<void>>);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const row = await spec
        .accept(
          this.db.selectFrom("source_links").selectAll(),
          new KyselySourceLinkSelectionVisitor<SourceLinkSelectionQuery>(),
        )
        .executeTakeFirst();

      return ok(row ? mapRow(row) : null);
    } catch (error) {
      return err(persistenceError("Source link could not be read", error));
    }
  }

  async upsert(
    record: SourceLinkRecord,
    spec: SourceLinkUpsertSpec,
  ): Promise<Result<SourceLinkRecord>> {
    const recordResult = validateRecord(record);
    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    try {
      const mutation = spec.accept(new KyselySourceLinkUpsertVisitor());
      const persisted = await this.db
        .insertInto("source_links")
        .values(mutation.values)
        .onConflict((conflict) =>
          conflict.column("source_fingerprint").doUpdateSet({
            project_id: mutation.values.project_id,
            environment_id: mutation.values.environment_id,
            resource_id: mutation.values.resource_id,
            server_id: mutation.values.server_id,
            destination_id: mutation.values.destination_id,
            updated_at: mutation.values.updated_at,
            reason: mutation.values.reason,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(mapRow(persisted));
    } catch (error) {
      return err(persistenceError("Source link could not be persisted", error));
    }
  }

  async deleteOne(spec: SourceLinkSelectionSpec): Promise<Result<boolean>> {
    const validation = spec.accept(ok(undefined), {
      visitSourceLinkBySourceFingerprint: (_query, sourceFingerprintSpec) =>
        validateSourceFingerprint(sourceFingerprintSpec.sourceFingerprint),
    } satisfies SourceLinkSelectionSpecVisitor<Result<void>>);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const deleted = await spec
        .accept(this.db.deleteFrom("source_links"), new KyselySourceLinkSelectionVisitor())
        .returning("source_fingerprint")
        .executeTakeFirst();

      return ok(Boolean(deleted));
    } catch (error) {
      return err(persistenceError("Source link could not be removed", error));
    }
  }
}
