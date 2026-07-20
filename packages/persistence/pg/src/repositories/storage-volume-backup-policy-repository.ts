import {
  type RepositoryContext,
  type StorageVolumeBackupPolicyRecord,
  type StorageVolumeBackupPolicyRepository,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryContextOrganizationId, resolveRepositoryExecutor } from "./shared";

type Row = Selectable<Database["storage_volume_backup_policies"]>;

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: Row): StorageVolumeBackupPolicyRecord {
  return {
    id: row.id,
    version: row.version,
    storageVolumeId: row.storage_volume_id,
    planRequest: row.plan_request as unknown as StorageVolumeBackupPolicyRecord["planRequest"],
    scheduledEnabled: row.scheduled_enabled,
    preDeployEnabled: row.pre_deploy_enabled,
    scheduleIntervalHours: row.schedule_interval_hours,
    retryOnFailure: row.retry_on_failure,
    failureMode: row.failure_mode as StorageVolumeBackupPolicyRecord["failureMode"],
    notificationRef: row.notification_ref,
    lastRunAt: row.last_run_at ? timestamp(row.last_run_at) : null,
    nextRunAt: timestamp(row.next_run_at),
    lastTrigger: row.last_trigger as StorageVolumeBackupPolicyRecord["lastTrigger"],
    lastStatus: row.last_status as StorageVolumeBackupPolicyRecord["lastStatus"],
    lastBackupId: row.last_backup_id,
    lastProcessAttemptId: row.last_process_attempt_id,
    lastPrunedCount: row.last_pruned_count,
    lastNotificationStatus:
      row.last_notification_status as StorageVolumeBackupPolicyRecord["lastNotificationStatus"],
    lastErrorCode: row.last_error_code,
    updatedAt: timestamp(row.updated_at),
  };
}

export class PgStorageVolumeBackupPolicyRepository implements StorageVolumeBackupPolicyRepository {
  constructor(private readonly db: Kysely<Database>) {}

  private visibleVolumeIds(context: RepositoryContext) {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    return organizationId
      ? executor
          .selectFrom("storage_volumes")
          .select("id")
          .where("project_id", "in", (projects) =>
            projects
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          )
      : null;
  }

  async findOne(
    context: RepositoryContext,
    policyId: string,
  ): Promise<Result<StorageVolumeBackupPolicyRecord | null>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      let query = executor
        .selectFrom("storage_volume_backup_policies")
        .selectAll()
        .where("id", "=", policyId);
      const visible = this.visibleVolumeIds(context);
      if (visible) query = query.where("storage_volume_id", "in", visible);
      const row = await query.executeTakeFirst();
      return ok(row ? toRecord(row) : null);
    } catch (error) {
      return err(
        domainError.infra("Storage volume backup policy could not be read", {
          phase: "storage-volume-backup-policy-read",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async listRecords(
    context: RepositoryContext,
    filter: Parameters<StorageVolumeBackupPolicyRepository["listRecords"]>[1] = {},
  ): Promise<Result<StorageVolumeBackupPolicyRecord[]>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      let query = executor.selectFrom("storage_volume_backup_policies").selectAll();
      const visible = this.visibleVolumeIds(context);
      if (visible) query = query.where("storage_volume_id", "in", visible);
      if (filter?.storageVolumeId)
        query = query.where("storage_volume_id", "=", filter.storageVolumeId);
      if (filter?.scheduledEnabledOnly) query = query.where("scheduled_enabled", "=", true);
      if (filter?.preDeployEnabledOnly) query = query.where("pre_deploy_enabled", "=", true);
      if (filter?.dueAt) query = query.where("next_run_at", "<=", filter.dueAt);
      if (filter?.dueAt) {
        query = query.where((builder) =>
          builder.or([
            builder("claim_until", "is", null),
            builder("claim_until", "<=", filter.dueAt as string),
          ]),
        );
      }
      if (filter?.resourceId) {
        query = query.where("storage_volume_id", "in", (attachments) =>
          attachments
            .selectFrom("resource_storage_attachments")
            .select("storage_volume_id")
            .where("resource_id", "=", filter.resourceId as string),
        );
      }
      if (filter?.limit) query = query.limit(filter.limit);
      return ok((await query.orderBy("next_run_at", "asc").execute()).map(toRecord));
    } catch (error) {
      return err(
        domainError.infra("Storage volume backup policies could not be listed", {
          phase: "storage-volume-backup-policy-read",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async upsert(
    context: RepositoryContext,
    record: StorageVolumeBackupPolicyRecord,
  ): Promise<Result<StorageVolumeBackupPolicyRecord>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      const visible = this.visibleVolumeIds(context);
      if (visible) {
        const volume = await executor
          .selectFrom("storage_volumes")
          .select("id")
          .where("id", "=", record.storageVolumeId)
          .where("id", "in", visible)
          .executeTakeFirst();
        if (!volume) return err(domainError.notFound("storage_volume", record.storageVolumeId));
      }
      const values = {
        id: record.id,
        version: record.version,
        storage_volume_id: record.storageVolumeId,
        plan_request: record.planRequest as unknown as Record<string, unknown>,
        scheduled_enabled: record.scheduledEnabled,
        pre_deploy_enabled: record.preDeployEnabled,
        schedule_interval_hours: record.scheduleIntervalHours,
        retry_on_failure: record.retryOnFailure,
        failure_mode: record.failureMode,
        notification_ref: record.notificationRef,
        last_run_at: record.lastRunAt,
        next_run_at: record.nextRunAt,
        last_trigger: record.lastTrigger,
        last_status: record.lastStatus,
        last_backup_id: record.lastBackupId,
        last_process_attempt_id: record.lastProcessAttemptId,
        last_pruned_count: record.lastPrunedCount,
        last_notification_status: record.lastNotificationStatus,
        last_error_code: record.lastErrorCode,
        updated_at: record.updatedAt,
      };
      await executor
        .insertInto("storage_volume_backup_policies")
        .values(values)
        .onConflict((conflict) => conflict.column("id").doUpdateSet(values))
        .execute();
      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Storage volume backup policy could not be persisted", {
          phase: "storage-volume-backup-policy-write",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async claimScheduledRun(
    context: RepositoryContext,
    input: { policyId: string; dueAt: string; claimUntil: string },
  ): Promise<Result<boolean>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      let query = executor
        .updateTable("storage_volume_backup_policies")
        .set({ claim_until: input.claimUntil })
        .where("id", "=", input.policyId)
        .where("scheduled_enabled", "=", true)
        .where("next_run_at", "<=", input.dueAt)
        .where((builder) =>
          builder.or([
            builder("claim_until", "is", null),
            builder("claim_until", "<=", input.dueAt),
          ]),
        );
      const visible = this.visibleVolumeIds(context);
      if (visible) query = query.where("storage_volume_id", "in", visible);
      const row = await query.returning("id").executeTakeFirst();
      return ok(Boolean(row));
    } catch (error) {
      return err(
        domainError.infra("Storage volume backup policy could not be claimed", {
          phase: "storage-volume-backup-policy-claim",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async recordRun(
    context: RepositoryContext,
    input: Parameters<StorageVolumeBackupPolicyRepository["recordRun"]>[1],
  ): Promise<Result<StorageVolumeBackupPolicyRecord>> {
    const existing = await this.findOne(context, input.id);
    if (existing.isErr()) return err(existing.error);
    if (!existing.value) return err(domainError.notFound("storage_volume_backup_policy", input.id));
    const persisted = await this.upsert(context, { ...existing.value, ...input });
    if (persisted.isErr()) return err(persisted.error);
    try {
      await resolveRepositoryExecutor(this.db, context)
        .updateTable("storage_volume_backup_policies")
        .set({ claim_until: null })
        .where("id", "=", input.id)
        .execute();
      return persisted;
    } catch (error) {
      return err(
        domainError.infra("Storage volume backup policy claim could not be released", {
          phase: "storage-volume-backup-policy-claim-release",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
