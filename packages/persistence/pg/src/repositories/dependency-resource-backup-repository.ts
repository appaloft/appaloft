import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type DependencyResourceBackupReadModel,
  type DependencyResourceBackupRepository,
  type DependencyResourceBackupSummary,
  type RepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DependencyResourceBackup,
  DependencyResourceBackupAttemptId,
  type DependencyResourceBackupByIdSpec,
  DependencyResourceBackupFailureCode,
  DependencyResourceBackupId,
  type DependencyResourceBackupMutationSpec,
  type DependencyResourceBackupMutationSpecVisitor,
  DependencyResourceBackupRetentionStatusValue,
  type DependencyResourceBackupSelectionSpec,
  type DependencyResourceBackupSelectionSpecVisitor,
  DependencyResourceBackupStatusValue,
  type DependencyResourceBackupsByDependencyResourceSpec,
  DependencyResourceProviderArtifactHandle,
  DependencyResourceRestoreAttemptId,
  DependencyResourceRestoreAttemptStatusValue,
  DescriptionText,
  EnvironmentId,
  OccurredAt,
  ProjectId,
  ProviderKey,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  type UpsertDependencyResourceBackupSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor, withRepositoryTransaction } from "./shared";

type BackupRow = Selectable<Database["dependency_resource_backups"]>;
type BackupSelectionQuery = SelectQueryBuilder<Database, "dependency_resource_backups", BackupRow>;

interface SerializedRestoreAttempt extends Record<string, unknown> {
  attemptId: string;
  status: "pending" | "completed" | "failed";
  requestedAt: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

class KyselyBackupSelectionVisitor
  implements DependencyResourceBackupSelectionSpecVisitor<BackupSelectionQuery>
{
  visitDependencyResourceBackupById(
    query: BackupSelectionQuery,
    spec: DependencyResourceBackupByIdSpec,
  ): BackupSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitDependencyResourceBackupsByDependencyResource(
    query: BackupSelectionQuery,
    spec: DependencyResourceBackupsByDependencyResourceSpec,
  ): BackupSelectionQuery {
    return query.where("dependency_resource_id", "=", spec.dependencyResourceId.value);
  }
}

class KyselyBackupMutationVisitor
  implements
    DependencyResourceBackupMutationSpecVisitor<{
      backup: Insertable<Database["dependency_resource_backups"]>;
    }>
{
  visitUpsertDependencyResourceBackup(spec: UpsertDependencyResourceBackupSpec) {
    const state = spec.state;
    const latestRestoreAttempt = state.latestRestoreAttempt
      ? ({
          attemptId: state.latestRestoreAttempt.attemptId.value,
          status: state.latestRestoreAttempt.status.value,
          requestedAt: state.latestRestoreAttempt.requestedAt.value,
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
        } satisfies SerializedRestoreAttempt)
      : null;

    return {
      backup: {
        id: state.id.value,
        dependency_resource_id: state.dependencyResourceId.value,
        project_id: state.projectId.value,
        environment_id: state.environmentId.value,
        dependency_kind: state.dependencyKind.value,
        provider_key: state.providerKey.value,
        status: state.status.value,
        attempt_id: state.attemptId.value,
        requested_at: state.requestedAt.value,
        retention_status: state.retentionStatus.value,
        provider_artifact_handle: state.providerArtifactHandle?.value ?? null,
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
): SerializedRestoreAttempt | undefined {
  return value ? (value as SerializedRestoreAttempt) : undefined;
}

function rehydrateBackup(row: BackupRow): DependencyResourceBackup {
  const latestRestoreAttempt = deserializeRestoreAttempt(row.latest_restore_attempt);
  return DependencyResourceBackup.rehydrate({
    id: DependencyResourceBackupId.rehydrate(row.id),
    dependencyResourceId: ResourceInstanceId.rehydrate(row.dependency_resource_id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    dependencyKind: ResourceInstanceKindValue.rehydrate(
      row.dependency_kind as Parameters<typeof ResourceInstanceKindValue.rehydrate>[0],
    ),
    providerKey: ProviderKey.rehydrate(row.provider_key),
    status: DependencyResourceBackupStatusValue.rehydrate(
      row.status as Parameters<typeof DependencyResourceBackupStatusValue.rehydrate>[0],
    ),
    attemptId: DependencyResourceBackupAttemptId.rehydrate(row.attempt_id),
    requestedAt: OccurredAt.rehydrate(normalizeTimestamp(row.requested_at) ?? row.requested_at),
    retentionStatus: DependencyResourceBackupRetentionStatusValue.rehydrate(
      row.retention_status as Parameters<
        typeof DependencyResourceBackupRetentionStatusValue.rehydrate
      >[0],
    ),
    ...(row.provider_artifact_handle
      ? {
          providerArtifactHandle: DependencyResourceProviderArtifactHandle.rehydrate(
            row.provider_artifact_handle,
          ),
        }
      : {}),
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
      ? { failureCode: DependencyResourceBackupFailureCode.rehydrate(row.failure_code) }
      : {}),
    ...(row.failure_message
      ? { failureMessage: DescriptionText.rehydrate(row.failure_message) }
      : {}),
    ...(latestRestoreAttempt
      ? {
          latestRestoreAttempt: {
            attemptId: DependencyResourceRestoreAttemptId.rehydrate(latestRestoreAttempt.attemptId),
            status: DependencyResourceRestoreAttemptStatusValue.rehydrate(
              latestRestoreAttempt.status,
            ),
            requestedAt: OccurredAt.rehydrate(latestRestoreAttempt.requestedAt),
            ...(latestRestoreAttempt.completedAt
              ? { completedAt: OccurredAt.rehydrate(latestRestoreAttempt.completedAt) }
              : {}),
            ...(latestRestoreAttempt.failedAt
              ? { failedAt: OccurredAt.rehydrate(latestRestoreAttempt.failedAt) }
              : {}),
            ...(latestRestoreAttempt.failureCode
              ? {
                  failureCode: DependencyResourceBackupFailureCode.rehydrate(
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

function toBackupSummary(row: BackupRow): DependencyResourceBackupSummary {
  const latestRestoreAttempt = deserializeRestoreAttempt(row.latest_restore_attempt);
  return {
    id: row.id,
    dependencyResourceId: row.dependency_resource_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    dependencyKind: row.dependency_kind as DependencyResourceBackupSummary["dependencyKind"],
    providerKey: row.provider_key,
    status: row.status as DependencyResourceBackupSummary["status"],
    attemptId: row.attempt_id,
    requestedAt: normalizeTimestamp(row.requested_at) ?? row.requested_at,
    retentionStatus: row.retention_status as DependencyResourceBackupSummary["retentionStatus"],
    ...(row.provider_artifact_handle
      ? { providerArtifactHandle: row.provider_artifact_handle }
      : {}),
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

export class PgDependencyResourceBackupRepository implements DependencyResourceBackupRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: DependencyResourceBackupSelectionSpec,
  ): Promise<DependencyResourceBackup | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("dependency-resource-backup", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "dependency-resource-backup",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("dependency_resource_backups").selectAll(),
            new KyselyBackupSelectionVisitor(),
          )
          .executeTakeFirst();
        return row ? rehydrateBackup(row) : null;
      },
    );
  }

  async findMany(
    context: RepositoryContext,
    spec: DependencyResourceBackupSelectionSpec,
  ): Promise<DependencyResourceBackup[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const rows = await spec
      .accept(
        executor
          .selectFrom("dependency_resource_backups")
          .selectAll()
          .orderBy("created_at", "desc"),
        new KyselyBackupSelectionVisitor(),
      )
      .execute();
    return rows.map(rehydrateBackup);
  }

  async upsert(
    context: RepositoryContext,
    backup: DependencyResourceBackup,
    spec: DependencyResourceBackupMutationSpec,
  ): Promise<void> {
    void backup;
    const mutation = spec.accept(new KyselyBackupMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("dependency-resource-backup", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "dependency-resource-backup",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("dependency_resource_backups")
            .values(mutation.backup)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                status: mutation.backup.status,
                retention_status: mutation.backup.retention_status,
                provider_artifact_handle: mutation.backup.provider_artifact_handle,
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

export class PgDependencyResourceBackupReadModel implements DependencyResourceBackupReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: {
      dependencyResourceId: string;
      status?: DependencyResourceBackupSummary["status"];
    },
  ): Promise<DependencyResourceBackupSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("dependency-resource-backup", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "dependency-resource-backup",
        },
      },
      async () => {
        let query = executor
          .selectFrom("dependency_resource_backups")
          .selectAll()
          .where("dependency_resource_id", "=", input.dependencyResourceId)
          .orderBy("created_at", "desc");
        if (input.status) {
          query = query.where("status", "=", input.status);
        }
        return (await query.execute()).map(toBackupSummary);
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: DependencyResourceBackupSelectionSpec,
  ): Promise<DependencyResourceBackupSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const row = await spec
      .accept(
        executor.selectFrom("dependency_resource_backups").selectAll(),
        new KyselyBackupSelectionVisitor(),
      )
      .executeTakeFirst();
    return row ? toBackupSummary(row) : null;
  }
}
