import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type RepositoryContext,
  type StorageVolumeBackupReadModel,
  type StorageVolumeBackupRepository,
  type StorageVolumeBackupSafetyEvidence,
  type StorageVolumeBackupSafetyReader,
  type StorageVolumeBackupSummary,
} from "@appaloft/application";
import {
  CreatedAt,
  DescriptionText,
  EnvironmentId,
  OccurredAt,
  ok,
  ProjectId,
  ResourceId,
  type Result,
  StorageVolumeBackup,
  StorageVolumeBackupArtifactHandle,
  StorageVolumeBackupAttemptId,
  type StorageVolumeBackupByIdSpec,
  StorageVolumeBackupConsistencyLevelValue,
  StorageVolumeBackupFailureCode,
  StorageVolumeBackupId,
  type StorageVolumeBackupMutationSpec,
  type StorageVolumeBackupMutationSpecVisitor,
  StorageVolumeBackupRetentionStatusValue,
  type StorageVolumeBackupSelectionSpec,
  type StorageVolumeBackupSelectionSpecVisitor,
  StorageVolumeBackupSourceAdapterKeyValue,
  StorageVolumeBackupStatusValue,
  type StorageVolumeBackupsByStorageVolumeSpec,
  StorageVolumeBackupTargetProviderKeyValue,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeRestoreAttemptId,
  StorageVolumeRestoreAttemptStatusValue,
  type UpsertStorageVolumeBackupSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
  withRepositoryTransaction,
} from "./shared";

type BackupRow = Selectable<Database["storage_volume_backups"]>;
type BackupSelectionQuery = SelectQueryBuilder<Database, "storage_volume_backups", BackupRow>;

interface SerializedStorageRestoreTarget extends Record<string, unknown> {
  storageVolumeId: string;
  restoredVolumeId?: string;
  destructiveInPlace: boolean;
}

interface SerializedStorageRestoreAttempt extends Record<string, unknown> {
  attemptId: string;
  status: "pending" | "completed" | "failed";
  requestedAt: string;
  target: SerializedStorageRestoreTarget;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

class KyselyStorageBackupSelectionVisitor
  implements StorageVolumeBackupSelectionSpecVisitor<BackupSelectionQuery>
{
  visitStorageVolumeBackupById(
    query: BackupSelectionQuery,
    spec: StorageVolumeBackupByIdSpec,
  ): BackupSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitStorageVolumeBackupsByStorageVolume(
    query: BackupSelectionQuery,
    spec: StorageVolumeBackupsByStorageVolumeSpec,
  ): BackupSelectionQuery {
    return query.where("storage_volume_id", "=", spec.storageVolumeId.value);
  }
}

class KyselyStorageBackupMutationVisitor
  implements
    StorageVolumeBackupMutationSpecVisitor<{
      backup: Insertable<Database["storage_volume_backups"]>;
    }>
{
  visitUpsertStorageVolumeBackup(spec: UpsertStorageVolumeBackupSpec) {
    const state = spec.state;
    const latestRestoreAttempt = state.latestRestoreAttempt
      ? ({
          attemptId: state.latestRestoreAttempt.attemptId.value,
          status: state.latestRestoreAttempt.status.value,
          requestedAt: state.latestRestoreAttempt.requestedAt.value,
          target: {
            storageVolumeId: state.latestRestoreAttempt.target.storageVolumeId.value,
            ...(state.latestRestoreAttempt.target.restoredVolumeId
              ? {
                  restoredVolumeId: state.latestRestoreAttempt.target.restoredVolumeId.value,
                }
              : {}),
            destructiveInPlace: state.latestRestoreAttempt.target.destructiveInPlace,
          },
          ...(state.latestRestoreAttempt.completedAt
            ? { completedAt: state.latestRestoreAttempt.completedAt.value }
            : {}),
          ...(state.latestRestoreAttempt.failedAt
            ? { failedAt: state.latestRestoreAttempt.failedAt.value }
            : {}),
          ...(state.latestRestoreAttempt.failureCode
            ? { failureCode: state.latestRestoreAttempt.failureCode.value }
            : {}),
          ...(state.latestRestoreAttempt.failureMessage
            ? { failureMessage: state.latestRestoreAttempt.failureMessage.value }
            : {}),
        } satisfies SerializedStorageRestoreAttempt)
      : null;

    return {
      backup: {
        id: state.id.value,
        storage_volume_id: state.storageVolumeId.value,
        project_id: state.projectId.value,
        environment_id: state.environmentId.value,
        resource_id: state.resourceId?.value ?? null,
        storage_volume_kind: state.storageVolumeKind.value,
        source_adapter_key: state.sourceAdapterKey.value,
        target_provider_key: state.targetProviderKey.value,
        target_ref: state.targetRef.value,
        consistency: state.consistency.value,
        status: state.status.value,
        attempt_id: state.attemptId.value,
        requested_at: state.requestedAt.value,
        retention_status: state.retentionStatus.value,
        local_only: state.localOnly,
        artifact_handle: state.artifactHandle?.value ?? null,
        size_bytes: state.sizeBytes ?? null,
        checksum: state.checksum?.value ?? null,
        completed_at: state.completedAt?.value ?? null,
        failed_at: state.failedAt?.value ?? null,
        failure_code: state.failureCode?.value ?? null,
        failure_message: state.failureMessage?.value ?? null,
        latest_restore_attempt: latestRestoreAttempt,
        created_at: state.createdAt.value,
      },
    };
  }
}

function deserializeRestoreAttempt(
  value: Record<string, unknown> | null,
): SerializedStorageRestoreAttempt | undefined {
  return value ? (value as SerializedStorageRestoreAttempt) : undefined;
}

function rehydrateBackup(row: BackupRow): StorageVolumeBackup {
  const latestRestoreAttempt = deserializeRestoreAttempt(row.latest_restore_attempt);
  return StorageVolumeBackup.rehydrate({
    id: StorageVolumeBackupId.rehydrate(row.id),
    storageVolumeId: StorageVolumeId.rehydrate(row.storage_volume_id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    ...(row.resource_id ? { resourceId: ResourceId.rehydrate(row.resource_id) } : {}),
    storageVolumeKind: StorageVolumeKindValue.rehydrate(
      row.storage_volume_kind as Parameters<typeof StorageVolumeKindValue.rehydrate>[0],
    ),
    sourceAdapterKey: StorageVolumeBackupSourceAdapterKeyValue.rehydrate(
      row.source_adapter_key as Parameters<
        typeof StorageVolumeBackupSourceAdapterKeyValue.rehydrate
      >[0],
    ),
    targetProviderKey: StorageVolumeBackupTargetProviderKeyValue.rehydrate(
      row.target_provider_key as Parameters<
        typeof StorageVolumeBackupTargetProviderKeyValue.rehydrate
      >[0],
    ),
    targetRef: DescriptionText.rehydrate(row.target_ref),
    consistency: StorageVolumeBackupConsistencyLevelValue.rehydrate(
      row.consistency as Parameters<typeof StorageVolumeBackupConsistencyLevelValue.rehydrate>[0],
    ),
    status: StorageVolumeBackupStatusValue.rehydrate(
      row.status as Parameters<typeof StorageVolumeBackupStatusValue.rehydrate>[0],
    ),
    attemptId: StorageVolumeBackupAttemptId.rehydrate(row.attempt_id),
    requestedAt: OccurredAt.rehydrate(normalizeTimestamp(row.requested_at) ?? row.requested_at),
    retentionStatus: StorageVolumeBackupRetentionStatusValue.rehydrate(
      row.retention_status as Parameters<
        typeof StorageVolumeBackupRetentionStatusValue.rehydrate
      >[0],
    ),
    localOnly: row.local_only,
    ...(row.artifact_handle
      ? { artifactHandle: StorageVolumeBackupArtifactHandle.rehydrate(row.artifact_handle) }
      : {}),
    ...(row.size_bytes !== null ? { sizeBytes: Number(row.size_bytes) } : {}),
    ...(row.checksum ? { checksum: DescriptionText.rehydrate(row.checksum) } : {}),
    ...(row.completed_at
      ? {
          completedAt: OccurredAt.rehydrate(
            normalizeTimestamp(row.completed_at) ?? row.completed_at,
          ),
        }
      : {}),
    ...(row.failed_at
      ? { failedAt: OccurredAt.rehydrate(normalizeTimestamp(row.failed_at) ?? row.failed_at) }
      : {}),
    ...(row.failure_code
      ? { failureCode: StorageVolumeBackupFailureCode.rehydrate(row.failure_code) }
      : {}),
    ...(row.failure_message
      ? { failureMessage: DescriptionText.rehydrate(row.failure_message) }
      : {}),
    ...(latestRestoreAttempt
      ? {
          latestRestoreAttempt: {
            attemptId: StorageVolumeRestoreAttemptId.rehydrate(latestRestoreAttempt.attemptId),
            status: StorageVolumeRestoreAttemptStatusValue.rehydrate(latestRestoreAttempt.status),
            requestedAt: OccurredAt.rehydrate(latestRestoreAttempt.requestedAt),
            target: {
              storageVolumeId: StorageVolumeId.rehydrate(
                latestRestoreAttempt.target.storageVolumeId,
              ),
              ...(latestRestoreAttempt.target.restoredVolumeId
                ? {
                    restoredVolumeId: StorageVolumeId.rehydrate(
                      latestRestoreAttempt.target.restoredVolumeId,
                    ),
                  }
                : {}),
              destructiveInPlace: latestRestoreAttempt.target.destructiveInPlace,
            },
            ...(latestRestoreAttempt.completedAt
              ? { completedAt: OccurredAt.rehydrate(latestRestoreAttempt.completedAt) }
              : {}),
            ...(latestRestoreAttempt.failedAt
              ? { failedAt: OccurredAt.rehydrate(latestRestoreAttempt.failedAt) }
              : {}),
            ...(latestRestoreAttempt.failureCode
              ? {
                  failureCode: StorageVolumeBackupFailureCode.rehydrate(
                    latestRestoreAttempt.failureCode,
                  ),
                }
              : {}),
            ...(latestRestoreAttempt.failureMessage
              ? { failureMessage: DescriptionText.rehydrate(latestRestoreAttempt.failureMessage) }
              : {}),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
  });
}

function toBackupSummary(row: BackupRow): StorageVolumeBackupSummary {
  const latestRestoreAttempt = deserializeRestoreAttempt(row.latest_restore_attempt);
  return {
    id: row.id,
    storageVolumeId: row.storage_volume_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    storageVolumeKind: row.storage_volume_kind as StorageVolumeBackupSummary["storageVolumeKind"],
    sourceAdapterKey: row.source_adapter_key,
    targetProviderKey: row.target_provider_key as StorageVolumeBackupSummary["targetProviderKey"],
    targetRef: row.target_ref,
    consistency: row.consistency,
    status: row.status as StorageVolumeBackupSummary["status"],
    attemptId: row.attempt_id,
    requestedAt: normalizeTimestamp(row.requested_at) ?? row.requested_at,
    retentionStatus: row.retention_status as StorageVolumeBackupSummary["retentionStatus"],
    localOnly: row.local_only,
    ...(row.artifact_handle ? { artifactHandle: row.artifact_handle } : {}),
    ...(row.size_bytes !== null ? { sizeBytes: Number(row.size_bytes) } : {}),
    ...(row.checksum ? { checksum: row.checksum } : {}),
    ...(row.completed_at
      ? { completedAt: normalizeTimestamp(row.completed_at) ?? row.completed_at }
      : {}),
    ...(row.failed_at ? { failedAt: normalizeTimestamp(row.failed_at) ?? row.failed_at } : {}),
    ...(row.failure_code ? { failureCode: row.failure_code } : {}),
    ...(row.failure_message ? { failureMessage: row.failure_message } : {}),
    ...(latestRestoreAttempt
      ? {
          latestRestoreAttempt: {
            attemptId: latestRestoreAttempt.attemptId,
            status: latestRestoreAttempt.status,
            requestedAt: latestRestoreAttempt.requestedAt,
            target: {
              storageVolumeId: latestRestoreAttempt.target.storageVolumeId,
              ...(latestRestoreAttempt.target.restoredVolumeId
                ? { restoredVolumeId: latestRestoreAttempt.target.restoredVolumeId }
                : {}),
              destructiveInPlace: latestRestoreAttempt.target.destructiveInPlace,
            },
            ...(latestRestoreAttempt.completedAt
              ? { completedAt: latestRestoreAttempt.completedAt }
              : {}),
            ...(latestRestoreAttempt.failedAt ? { failedAt: latestRestoreAttempt.failedAt } : {}),
            ...(latestRestoreAttempt.failureCode
              ? { failureCode: latestRestoreAttempt.failureCode }
              : {}),
            ...(latestRestoreAttempt.failureMessage
              ? { failureMessage: latestRestoreAttempt.failureMessage }
              : {}),
          },
        }
      : {}),
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
  };
}

export class PgStorageVolumeBackupRepository implements StorageVolumeBackupRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: StorageVolumeBackupSelectionSpec,
  ): Promise<StorageVolumeBackup | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("storage-volume-backup", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "storage-volume-backup",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = spec.accept(
          executor.selectFrom("storage_volume_backups").selectAll(),
          new KyselyStorageBackupSelectionVisitor(),
        );
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }
        const row = await query.executeTakeFirst();
        return row ? rehydrateBackup(row) : null;
      },
    );
  }

  async findMany(
    context: RepositoryContext,
    spec: StorageVolumeBackupSelectionSpec,
  ): Promise<StorageVolumeBackup[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    let query = spec.accept(
      executor.selectFrom("storage_volume_backups").selectAll().orderBy("created_at", "desc"),
      new KyselyStorageBackupSelectionVisitor(),
    );
    if (organizationId) {
      query = query.where(
        "project_id",
        "in",
        executor.selectFrom("projects").select("id").where("organization_id", "=", organizationId),
      );
    }
    const rows = await query.execute();
    return rows.map(rehydrateBackup);
  }

  async upsert(
    context: RepositoryContext,
    backup: StorageVolumeBackup,
    spec: StorageVolumeBackupMutationSpec,
  ): Promise<void> {
    void backup;
    const mutation = spec.accept(new KyselyStorageBackupMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("storage-volume-backup", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "storage-volume-backup",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("storage_volume_backups")
            .values(mutation.backup)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                status: mutation.backup.status,
                retention_status: mutation.backup.retention_status,
                local_only: mutation.backup.local_only,
                artifact_handle: mutation.backup.artifact_handle,
                size_bytes: mutation.backup.size_bytes,
                checksum: mutation.backup.checksum,
                completed_at: mutation.backup.completed_at,
                failed_at: mutation.backup.failed_at,
                failure_code: mutation.backup.failure_code,
                failure_message: mutation.backup.failure_message,
                latest_restore_attempt: mutation.backup.latest_restore_attempt,
              }),
            )
            .execute();
        });
      },
    );
  }
}

export class PgStorageVolumeBackupReadModel implements StorageVolumeBackupReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: {
      storageVolumeId: string;
      status?: StorageVolumeBackupSummary["status"];
    },
  ): Promise<StorageVolumeBackupSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("storage-volume-backup", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "storage-volume-backup",
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("storage_volume_backups")
          .selectAll()
          .where("storage_volume_id", "=", input.storageVolumeId)
          .orderBy("created_at", "desc");
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }
        if (input.status) {
          query = query.where("status", "=", input.status);
        }
        return (await query.execute()).map(toBackupSummary);
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: StorageVolumeBackupSelectionSpec,
  ): Promise<StorageVolumeBackupSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    let query = spec.accept(
      executor.selectFrom("storage_volume_backups").selectAll(),
      new KyselyStorageBackupSelectionVisitor(),
    );
    if (organizationId) {
      query = query.where(
        "project_id",
        "in",
        executor.selectFrom("projects").select("id").where("organization_id", "=", organizationId),
      );
    }
    const row = await query.executeTakeFirst();
    return row ? toBackupSummary(row) : null;
  }
}

export class PgStorageVolumeBackupSafetyReader implements StorageVolumeBackupSafetyReader {
  constructor(private readonly db: Kysely<Database>) {}

  async findSafetyEvidence(
    context: RepositoryContext,
    input: { storageVolumeId: string },
  ): Promise<Result<StorageVolumeBackupSafetyEvidence>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("storage-volume-backup", "safety_evidence"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "storage-volume-backup-safety",
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("storage_volume_backups")
          .select(["status", "retention_status", "latest_restore_attempt"])
          .where("storage_volume_id", "=", input.storageVolumeId);
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }

        const rows = await query.execute();
        const backupRetentionRequired = rows.some(
          (row) => row.status === "pending" || row.retention_status === "retained",
        );
        const backupRestoreInFlightCount = rows.filter((row) => {
          const restoreAttempt = deserializeRestoreAttempt(row.latest_restore_attempt);
          return restoreAttempt?.status === "pending";
        }).length;

        return ok({
          backupRetentionRequired,
          backupRestoreInFlightCount,
        });
      },
    );
  }
}
