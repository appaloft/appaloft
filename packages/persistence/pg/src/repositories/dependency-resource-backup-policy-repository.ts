import {
  type DependencyResourceBackupPolicyListFilter,
  type DependencyResourceBackupPolicyRecord,
  type DependencyResourceBackupPolicyRepository,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type DependencyResourceBackupPolicyRow = Selectable<
  Database["dependency_resource_backup_policies"]
>;

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: DependencyResourceBackupPolicyRow): DependencyResourceBackupPolicyRecord {
  return {
    id: row.id,
    version: row.version,
    dependencyResourceId: row.dependency_resource_id,
    retentionDays: row.retention_days,
    scheduleIntervalHours: row.schedule_interval_hours,
    providerKey: row.provider_key,
    retryOnFailure: row.retry_on_failure,
    enabled: row.enabled,
    lastRunAt: row.last_run_at ? serializeTimestamp(row.last_run_at) : null,
    nextRunAt: serializeTimestamp(row.next_run_at),
    updatedAt: serializeTimestamp(row.updated_at),
  };
}

export class PgDependencyResourceBackupPolicyRepository
  implements DependencyResourceBackupPolicyRepository
{
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    policyId: string,
  ): Promise<Result<DependencyResourceBackupPolicyRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const row = await executor
        .selectFrom("dependency_resource_backup_policies")
        .selectAll()
        .where("id", "=", policyId)
        .executeTakeFirst();

      return ok(row ? toRecord(row) : null);
    } catch (error) {
      return err(
        domainError.infra("Dependency resource backup policy could not be read", {
          phase: "dependency-resource-backup-policy-read",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async listRecords(
    context: RepositoryContext,
    filter: DependencyResourceBackupPolicyListFilter = {},
  ): Promise<Result<DependencyResourceBackupPolicyRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor.selectFrom("dependency_resource_backup_policies").selectAll();

      if (filter.enabledOnly === true) {
        query = query.where("enabled", "=", true);
      }

      if (filter.dependencyResourceId) {
        query = query.where("dependency_resource_id", "=", filter.dependencyResourceId);
      }

      if (filter.dueAt) {
        query = query.where("next_run_at", "<=", filter.dueAt);
      }

      const rows = await query.orderBy("next_run_at", "asc").execute();
      return ok(rows.map(toRecord));
    } catch (error) {
      return err(
        domainError.infra("Dependency resource backup policies could not be listed", {
          phase: "dependency-resource-backup-policy-read",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async upsert(
    context: RepositoryContext,
    record: DependencyResourceBackupPolicyRecord,
  ): Promise<Result<DependencyResourceBackupPolicyRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      await executor
        .insertInto("dependency_resource_backup_policies")
        .values({
          id: record.id,
          version: record.version,
          dependency_resource_id: record.dependencyResourceId,
          retention_days: record.retentionDays,
          schedule_interval_hours: record.scheduleIntervalHours,
          provider_key: record.providerKey,
          retry_on_failure: record.retryOnFailure,
          enabled: record.enabled,
          last_run_at: record.lastRunAt,
          next_run_at: record.nextRunAt,
          updated_at: record.updatedAt,
        })
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            version: record.version,
            dependency_resource_id: record.dependencyResourceId,
            retention_days: record.retentionDays,
            schedule_interval_hours: record.scheduleIntervalHours,
            provider_key: record.providerKey,
            retry_on_failure: record.retryOnFailure,
            enabled: record.enabled,
            last_run_at: record.lastRunAt,
            next_run_at: record.nextRunAt,
            updated_at: record.updatedAt,
          }),
        )
        .execute();

      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Dependency resource backup policy could not be persisted", {
          phase: "dependency-resource-backup-policy-write",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async markRun(
    context: RepositoryContext,
    input: {
      policyId: string;
      lastRunAt: string;
      nextRunAt: string;
      updatedAt: string;
    },
  ): Promise<Result<DependencyResourceBackupPolicyRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      await executor
        .updateTable("dependency_resource_backup_policies")
        .set({
          last_run_at: input.lastRunAt,
          next_run_at: input.nextRunAt,
          updated_at: input.updatedAt,
        })
        .where("id", "=", input.policyId)
        .execute();

      const row = await executor
        .selectFrom("dependency_resource_backup_policies")
        .selectAll()
        .where("id", "=", input.policyId)
        .executeTakeFirst();

      if (!row) {
        return err(domainError.notFound("dependency_resource_backup_policy", input.policyId));
      }

      return ok(toRecord(row));
    } catch (error) {
      return err(
        domainError.infra("Dependency resource backup policy run state could not be persisted", {
          phase: "dependency-resource-backup-policy-write",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
