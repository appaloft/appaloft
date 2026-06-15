import {
  type RepositoryContext,
  type RetentionDefaultCategory,
  type RetentionDefaultListFilter,
  type RetentionDefaultRecord,
  type RetentionDefaultRepository,
  type RetentionDefaultScope,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryContextOrganizationId, resolveRepositoryExecutor } from "./shared";

type RetentionDefaultRow = Selectable<Database["retention_defaults"]>;

const scopes: ReadonlySet<RetentionDefaultScope> = new Set(["organization", "system"]);

const categories: ReadonlySet<RetentionDefaultCategory> = new Set([
  "audit-rows",
  "domain-event-streams",
  "process-attempts",
  "provider-job-logs",
  "resource-runtime-log-archives",
]);

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: RetentionDefaultRow): RetentionDefaultRecord | null {
  if (!scopes.has(row.scope as RetentionDefaultScope)) {
    return null;
  }
  if (!categories.has(row.category as RetentionDefaultCategory)) {
    return null;
  }

  return {
    id: row.id,
    scope: row.scope as RetentionDefaultScope,
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    category: row.category as RetentionDefaultCategory,
    retentionDays: row.retention_days,
    dryRunSchedulingEnabled: row.dry_run_scheduling_enabled,
    destructiveSchedulingEnabled: row.destructive_scheduling_enabled,
    enabled: row.enabled,
    updatedAt: serializeTimestamp(row.updated_at),
    ...(row.updated_by_actor_id ? { updatedByActorId: row.updated_by_actor_id } : {}),
    ...(row.updated_by_actor_kind === "deploy-token" ||
    row.updated_by_actor_kind === "system" ||
    row.updated_by_actor_kind === "user"
      ? { updatedByActorKind: row.updated_by_actor_kind }
      : {}),
  };
}

export class PgRetentionDefaultRepository implements RetentionDefaultRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    input: {
      scope?: RetentionDefaultScope;
      organizationId?: string;
      category: RetentionDefaultCategory;
    },
  ): Promise<Result<RetentionDefaultRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("retention_defaults")
        .selectAll()
        .where("category", "=", input.category);

      if (input.scope) {
        query = query.where("scope", "=", input.scope);
      }

      const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
      if (
        contextOrganizationId &&
        input.organizationId !== undefined &&
        input.organizationId !== contextOrganizationId
      ) {
        return ok(null);
      }

      query =
        input.organizationId === undefined
          ? query.where("organization_id", "is", null)
          : query.where("organization_id", "=", input.organizationId);

      const row = await query.orderBy("updated_at", "desc").executeTakeFirst();

      return ok(row ? toRecord(row) : null);
    } catch (error) {
      return err(
        domainError.infra("Retention default could not be read", {
          phase: "retention-defaults-read",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async list(
    context: RepositoryContext,
    filter: RetentionDefaultListFilter = {},
  ): Promise<Result<RetentionDefaultRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor.selectFrom("retention_defaults").selectAll();
      const contextOrganizationId = resolveRepositoryContextOrganizationId(context);

      if (filter.scope) {
        query = query.where("scope", "=", filter.scope);
      }

      if (filter.organizationId !== undefined) {
        if (contextOrganizationId && filter.organizationId !== contextOrganizationId) {
          return ok([]);
        }
        query = query.where("organization_id", "=", filter.organizationId);
      } else if (contextOrganizationId) {
        query = query.where((eb) =>
          eb.or([
            eb("organization_id", "is", null),
            eb("organization_id", "=", contextOrganizationId),
          ]),
        );
      }

      if (filter.category) {
        query = query.where("category", "=", filter.category);
      }

      if (filter.enabledOnly === true) {
        query = query.where("enabled", "=", true);
      }

      const rows = await query.orderBy("updated_at", "asc").execute();
      return ok(
        rows.flatMap((row) => {
          const record = toRecord(row);
          return record ? [record] : [];
        }),
      );
    } catch (error) {
      return err(
        domainError.infra("Retention defaults could not be listed", {
          phase: "retention-defaults-read",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async upsert(
    context: RepositoryContext,
    record: RetentionDefaultRecord,
  ): Promise<Result<RetentionDefaultRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
      if (
        contextOrganizationId &&
        record.organizationId !== undefined &&
        record.organizationId !== contextOrganizationId
      ) {
        return err(domainError.notFound("organization", record.organizationId));
      }

      await executor
        .insertInto("retention_defaults")
        .values({
          id: record.id,
          scope: record.scope,
          organization_id: record.organizationId ?? null,
          category: record.category,
          retention_days: record.retentionDays,
          dry_run_scheduling_enabled: record.dryRunSchedulingEnabled,
          destructive_scheduling_enabled: record.destructiveSchedulingEnabled,
          enabled: record.enabled,
          updated_at: record.updatedAt,
          updated_by_actor_id: record.updatedByActorId ?? null,
          updated_by_actor_kind: record.updatedByActorKind ?? null,
        })
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            scope: record.scope,
            organization_id: record.organizationId ?? null,
            category: record.category,
            retention_days: record.retentionDays,
            dry_run_scheduling_enabled: record.dryRunSchedulingEnabled,
            destructive_scheduling_enabled: record.destructiveSchedulingEnabled,
            enabled: record.enabled,
            updated_at: record.updatedAt,
            updated_by_actor_id: record.updatedByActorId ?? null,
            updated_by_actor_kind: record.updatedByActorKind ?? null,
          }),
        )
        .execute();

      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Retention default could not be persisted", {
          phase: "retention-defaults-write",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
