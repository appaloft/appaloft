import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type RepositoryContext,
  type StorageVolumeReadModel,
  type StorageVolumeRepository,
  type StorageVolumeSummary,
} from "@appaloft/application";
import {
  CreatedAt,
  DeletedAt,
  DescriptionText,
  EnvironmentId,
  ProjectId,
  StorageBindSourcePath,
  StorageVolume,
  type StorageVolumeBackupDataFormat,
  type StorageVolumeByEnvironmentAndSlugSpec,
  type StorageVolumeByIdSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeLifecycleStatusValue,
  type StorageVolumeMutationSpec,
  type StorageVolumeMutationSpecVisitor,
  StorageVolumeName,
  type StorageVolumeSelectionSpec,
  type StorageVolumeSelectionSpecVisitor,
  StorageVolumeSlug,
  type UpsertStorageVolumeSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  type RepositoryExecutor,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
  withRepositoryTransaction,
} from "./shared";

type StorageVolumeSelectionQuery = SelectQueryBuilder<
  Database,
  "storage_volumes",
  Selectable<Database["storage_volumes"]>
>;
type StorageVolumeRow = Selectable<Database["storage_volumes"]>;
type StorageAttachmentRow = {
  attachment_id: string;
  resource_id: string;
  resource_name: string | null;
  resource_slug: string | null;
  storage_volume_id: string;
  destination_path: string;
  mount_mode: string;
  data_format: string | null;
  application_data_label: string | null;
  attached_at: string;
};

interface SerializedStorageBackupRelationship extends Record<string, unknown> {
  retentionRequired: boolean;
  reason?: string;
}

class KyselyStorageVolumeSelectionVisitor
  implements StorageVolumeSelectionSpecVisitor<StorageVolumeSelectionQuery>
{
  visitStorageVolumeById(
    query: StorageVolumeSelectionQuery,
    spec: StorageVolumeByIdSpec,
  ): StorageVolumeSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitStorageVolumeByEnvironmentAndSlug(
    query: StorageVolumeSelectionQuery,
    spec: StorageVolumeByEnvironmentAndSlugSpec,
  ): StorageVolumeSelectionQuery {
    return query
      .where("project_id", "=", spec.projectId.value)
      .where("environment_id", "=", spec.environmentId.value)
      .where("slug", "=", spec.slug.value);
  }
}

class KyselyStorageVolumeMutationVisitor
  implements
    StorageVolumeMutationSpecVisitor<{
      storageVolume: Insertable<Database["storage_volumes"]>;
    }>
{
  visitUpsertStorageVolume(spec: UpsertStorageVolumeSpec) {
    const backupRelationship = spec.state.backupRelationship
      ? ({
          retentionRequired: spec.state.backupRelationship.retentionRequired,
          ...(spec.state.backupRelationship.reason
            ? { reason: spec.state.backupRelationship.reason.value }
            : {}),
        } satisfies SerializedStorageBackupRelationship)
      : null;

    return {
      storageVolume: {
        id: spec.state.id.value,
        project_id: spec.state.projectId.value,
        environment_id: spec.state.environmentId.value,
        name: spec.state.name.value,
        slug: spec.state.slug.value,
        kind: spec.state.kind.value,
        source_path: spec.state.sourcePath?.value ?? null,
        description: spec.state.description?.value ?? null,
        backup_relationship: backupRelationship,
        lifecycle_status: spec.state.lifecycleStatus.value,
        created_at: spec.state.createdAt.value,
        deleted_at: spec.state.deletedAt?.value ?? null,
      },
    };
  }
}

function rehydrateStorageVolume(row: StorageVolumeRow): StorageVolume {
  const backupRelationship = row.backup_relationship
    ? (row.backup_relationship as SerializedStorageBackupRelationship)
    : undefined;

  return StorageVolume.rehydrate({
    id: StorageVolumeId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    name: StorageVolumeName.rehydrate(row.name),
    slug: StorageVolumeSlug.rehydrate(row.slug),
    kind: StorageVolumeKindValue.rehydrate(
      row.kind as Parameters<typeof StorageVolumeKindValue.rehydrate>[0],
    ),
    ...(row.source_path ? { sourcePath: StorageBindSourcePath.rehydrate(row.source_path) } : {}),
    ...(row.description ? { description: DescriptionText.rehydrate(row.description) } : {}),
    ...(backupRelationship
      ? {
          backupRelationship: {
            retentionRequired: backupRelationship.retentionRequired,
            ...(backupRelationship.reason
              ? { reason: DescriptionText.rehydrate(backupRelationship.reason) }
              : {}),
          },
        }
      : {}),
    lifecycleStatus: StorageVolumeLifecycleStatusValue.rehydrate(
      row.lifecycle_status as Parameters<typeof StorageVolumeLifecycleStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.deleted_at
      ? { deletedAt: DeletedAt.rehydrate(normalizeTimestamp(row.deleted_at) ?? row.deleted_at) }
      : {}),
  });
}

function toStorageVolumeSummary(
  row: StorageVolumeRow,
  attachments: StorageAttachmentRow[],
): StorageVolumeSummary {
  const backupRelationship = row.backup_relationship
    ? (row.backup_relationship as SerializedStorageBackupRelationship)
    : undefined;
  const storageAttachments = attachments.filter(
    (attachment) => attachment.storage_volume_id === row.id,
  );

  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as StorageVolumeSummary["kind"],
    ...(row.source_path ? { sourcePath: row.source_path } : {}),
    ...(row.description ? { description: row.description } : {}),
    lifecycleStatus: row.lifecycle_status as StorageVolumeSummary["lifecycleStatus"],
    ...(backupRelationship
      ? {
          backupRelationship: {
            retentionRequired: backupRelationship.retentionRequired,
            ...(backupRelationship.reason ? { reason: backupRelationship.reason } : {}),
          },
        }
      : {}),
    attachmentCount: storageAttachments.length,
    attachments: storageAttachments.map((attachment) => {
      const dataFormat = attachment.data_format as StorageVolumeBackupDataFormat | null;

      return {
        attachmentId: attachment.attachment_id,
        resourceId: attachment.resource_id,
        ...(attachment.resource_name ? { resourceName: attachment.resource_name } : {}),
        ...(attachment.resource_slug ? { resourceSlug: attachment.resource_slug } : {}),
        destinationPath: attachment.destination_path,
        mountMode:
          attachment.mount_mode as StorageVolumeSummary["attachments"][number]["mountMode"],
        ...(dataFormat ? { dataFormat } : {}),
        ...(attachment.application_data_label
          ? { applicationDataLabel: attachment.application_data_label }
          : {}),
        attachedAt: normalizeTimestamp(attachment.attached_at) ?? attachment.attached_at,
      };
    }),
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(row.deleted_at ? { deletedAt: normalizeTimestamp(row.deleted_at) ?? row.deleted_at } : {}),
  };
}

async function loadAttachments(
  executor: RepositoryExecutor,
  storageVolumeIds: string[],
): Promise<StorageAttachmentRow[]> {
  if (storageVolumeIds.length === 0) {
    return [];
  }

  return executor
    .selectFrom("resource_storage_attachments")
    .innerJoin("resources", "resources.id", "resource_storage_attachments.resource_id")
    .select([
      "resource_storage_attachments.id as attachment_id",
      "resource_storage_attachments.resource_id",
      "resources.name as resource_name",
      "resources.slug as resource_slug",
      "resource_storage_attachments.storage_volume_id",
      "resource_storage_attachments.destination_path",
      "resource_storage_attachments.mount_mode",
      "resource_storage_attachments.data_format",
      "resource_storage_attachments.application_data_label",
      "resource_storage_attachments.attached_at",
    ])
    .where("resource_storage_attachments.storage_volume_id", "in", storageVolumeIds)
    .where("resources.lifecycle_status", "!=", "deleted")
    .orderBy("resource_storage_attachments.attached_at", "asc")
    .execute();
}

export class PgStorageVolumeRepository implements StorageVolumeRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: StorageVolumeSelectionSpec,
  ): Promise<StorageVolume | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("storage-volume", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "storage-volume",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = spec.accept(
          executor.selectFrom("storage_volumes").selectAll(),
          new KyselyStorageVolumeSelectionVisitor(),
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

        return row ? rehydrateStorageVolume(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    storageVolume: StorageVolume,
    spec: StorageVolumeMutationSpec,
  ): Promise<void> {
    void storageVolume;
    const mutation = spec.accept(new KyselyStorageVolumeMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("storage-volume", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "storage-volume",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("storage_volumes")
            .values(mutation.storageVolume)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                name: mutation.storageVolume.name,
                slug: mutation.storageVolume.slug,
                description: mutation.storageVolume.description,
                backup_relationship: mutation.storageVolume.backup_relationship,
                lifecycle_status: mutation.storageVolume.lifecycle_status,
                deleted_at: mutation.storageVolume.deleted_at,
              }),
            )
            .execute();
        });
      },
    );
  }
}

export class PgStorageVolumeReadModel implements StorageVolumeReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<StorageVolumeSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("storage-volume", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "storage-volume",
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("storage_volumes")
          .selectAll()
          .where("lifecycle_status", "!=", "deleted")
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

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }
        if (input?.environmentId) {
          query = query.where("environment_id", "=", input.environmentId);
        }

        const rows = await query.execute();
        const attachments = await loadAttachments(
          executor,
          rows.map((row) => row.id),
        );
        return rows.map((row) => toStorageVolumeSummary(row, attachments));
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: StorageVolumeSelectionSpec,
  ): Promise<StorageVolumeSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("storage-volume", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "storage-volume",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = spec.accept(
          executor
            .selectFrom("storage_volumes")
            .selectAll()
            .where("lifecycle_status", "!=", "deleted"),
          new KyselyStorageVolumeSelectionVisitor(),
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

        if (!row) {
          return null;
        }

        const attachments = await loadAttachments(executor, [row.id]);
        return toStorageVolumeSummary(row, attachments);
      },
    );
  }

  async countAttachments(context: RepositoryContext, storageVolumeId: string): Promise<number> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    let query = executor
      .selectFrom("resource_storage_attachments")
      .innerJoin(
        "storage_volumes",
        "storage_volumes.id",
        "resource_storage_attachments.storage_volume_id",
      )
      .innerJoin("resources", "resources.id", "resource_storage_attachments.resource_id")
      .select((expressionBuilder) =>
        expressionBuilder.fn
          .count<number>("resource_storage_attachments.id")
          .as("attachment_count"),
      )
      .where("resource_storage_attachments.storage_volume_id", "=", storageVolumeId)
      .where("resources.lifecycle_status", "!=", "deleted");
    if (organizationId) {
      query = query.where(
        "storage_volumes.project_id",
        "in",
        executor.selectFrom("projects").select("id").where("organization_id", "=", organizationId),
      );
    }
    const row = await query.executeTakeFirst();

    return Number(row?.attachment_count ?? 0);
  }
}
