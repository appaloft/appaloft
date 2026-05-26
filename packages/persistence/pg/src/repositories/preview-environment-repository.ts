import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type PreviewEnvironmentReadModel,
  type PreviewEnvironmentRepository,
  type PreviewEnvironmentSummary,
  type PreviewExpiredEnvironmentCandidate,
  type PreviewExpiredEnvironmentCandidateReader,
  type RepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  type DeletePreviewEnvironmentSpec,
  DeploymentTargetId,
  DestinationId,
  EnvironmentId,
  GitCommitShaText,
  GitRefText,
  PreviewEnvironment,
  type PreviewEnvironmentByIdSpec,
  PreviewEnvironmentExpiresAt,
  PreviewEnvironmentId,
  type PreviewEnvironmentMutationSpec,
  type PreviewEnvironmentMutationSpecVisitor,
  PreviewEnvironmentProviderValue,
  type PreviewEnvironmentSelectionSpec,
  type PreviewEnvironmentSelectionSpecVisitor,
  type PreviewEnvironmentStatus,
  PreviewEnvironmentStatusValue,
  PreviewPullRequestNumber,
  ProjectId,
  ResourceId,
  SourceBindingFingerprint,
  SourceRepositoryFullName,
  UpdatedAt,
  type UpsertPreviewEnvironmentSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
} from "./shared";

type PreviewEnvironmentRow = Selectable<Database["preview_environments"]>;
type PreviewEnvironmentSelectionQuery = SelectQueryBuilder<
  Database,
  "preview_environments",
  PreviewEnvironmentRow
>;
type PreviewEnvironmentMutation = {
  previewEnvironment?: Insertable<Database["preview_environments"]>;
  delete?: {
    previewEnvironmentId: string;
    resourceId: string;
  };
};

class KyselyPreviewEnvironmentSelectionVisitor
  implements PreviewEnvironmentSelectionSpecVisitor<PreviewEnvironmentSelectionQuery>
{
  visitPreviewEnvironmentById(
    query: PreviewEnvironmentSelectionQuery,
    spec: PreviewEnvironmentByIdSpec,
  ): PreviewEnvironmentSelectionQuery {
    const scoped = query.where("id", "=", spec.previewEnvironmentId.value);
    return spec.resourceId ? scoped.where("resource_id", "=", spec.resourceId.value) : scoped;
  }

  visitPreviewEnvironmentBySourceScope(
    query: PreviewEnvironmentSelectionQuery,
    spec: Parameters<
      PreviewEnvironmentSelectionSpecVisitor<PreviewEnvironmentSelectionQuery>["visitPreviewEnvironmentBySourceScope"]
    >[1],
  ): PreviewEnvironmentSelectionQuery {
    const scoped = query
      .where("provider", "=", spec.provider.value)
      .where("repository_full_name", "=", spec.repositoryFullName.value)
      .where("pull_request_number", "=", spec.pullRequestNumber.value);

    return spec.resourceId ? scoped.where("resource_id", "=", spec.resourceId.value) : scoped;
  }
}

class KyselyPreviewEnvironmentMutationVisitor
  implements PreviewEnvironmentMutationSpecVisitor<PreviewEnvironmentMutation>
{
  visitUpsertPreviewEnvironment(spec: UpsertPreviewEnvironmentSpec): PreviewEnvironmentMutation {
    const state = spec.state;
    return {
      previewEnvironment: {
        id: state.id.value,
        project_id: state.projectId.value,
        environment_id: state.environmentId.value,
        resource_id: state.resourceId.value,
        server_id: state.serverId.value,
        destination_id: state.destinationId.value,
        provider: state.provider.value,
        repository_full_name: state.source.repositoryFullName.value,
        head_repository_full_name: state.source.headRepositoryFullName.value,
        pull_request_number: state.source.pullRequestNumber.value,
        head_sha: state.source.headSha.value,
        base_ref: state.source.baseRef.value,
        source_binding_fingerprint: state.source.sourceBindingFingerprint.value,
        status: state.status.value,
        created_at: state.createdAt.value,
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
        expires_at: state.expiresAt?.value ?? null,
      },
    };
  }

  visitDeletePreviewEnvironment(spec: DeletePreviewEnvironmentSpec): PreviewEnvironmentMutation {
    return {
      delete: {
        previewEnvironmentId: spec.previewEnvironmentId.value,
        resourceId: spec.resourceId.value,
      },
    };
  }
}

export class PgPreviewEnvironmentRepository implements PreviewEnvironmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: PreviewEnvironmentSelectionSpec,
  ): Promise<PreviewEnvironment | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("preview_environment", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_environment",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("preview_environments").selectAll(),
            new KyselyPreviewEnvironmentSelectionVisitor(),
          )
          .executeTakeFirst();

        return row ? previewEnvironmentFromRow(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    previewEnvironment: PreviewEnvironment,
    spec: PreviewEnvironmentMutationSpec,
  ): Promise<void> {
    void previewEnvironment;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyPreviewEnvironmentMutationVisitor());
    if (!mutation.previewEnvironment) {
      return;
    }
    const previewEnvironmentRow = mutation.previewEnvironment;

    await context.tracer.startActiveSpan(
      createRepositorySpanName("preview_environment", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_environment",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("preview_environments")
          .values(previewEnvironmentRow)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              project_id: previewEnvironmentRow.project_id,
              environment_id: previewEnvironmentRow.environment_id,
              resource_id: previewEnvironmentRow.resource_id,
              server_id: previewEnvironmentRow.server_id,
              destination_id: previewEnvironmentRow.destination_id,
              provider: previewEnvironmentRow.provider,
              repository_full_name: previewEnvironmentRow.repository_full_name,
              head_repository_full_name: previewEnvironmentRow.head_repository_full_name,
              pull_request_number: previewEnvironmentRow.pull_request_number,
              head_sha: previewEnvironmentRow.head_sha,
              base_ref: previewEnvironmentRow.base_ref,
              source_binding_fingerprint: previewEnvironmentRow.source_binding_fingerprint,
              status: previewEnvironmentRow.status,
              updated_at: previewEnvironmentRow.updated_at,
              expires_at: previewEnvironmentRow.expires_at,
            }),
          )
          .execute();
      },
    );
  }

  async delete(context: RepositoryContext, spec: PreviewEnvironmentMutationSpec): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyPreviewEnvironmentMutationVisitor());
    if (!mutation.delete) {
      return;
    }
    const deleteInput = mutation.delete;

    await context.tracer.startActiveSpan(
      createRepositorySpanName("preview_environment", "delete"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_environment",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .deleteFrom("preview_environments")
          .where("id", "=", deleteInput.previewEnvironmentId)
          .where("resource_id", "=", deleteInput.resourceId)
          .execute();
      },
    );
  }
}

export class PgPreviewEnvironmentReadModel implements PreviewEnvironmentReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: Parameters<PreviewEnvironmentReadModel["list"]>[1],
  ): Promise<{ items: PreviewEnvironmentSummary[]; nextCursor?: string }> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const limit = input?.limit ?? 50;
    let query = executor
      .selectFrom("preview_environments")
      .selectAll()
      .limit(limit + 1);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    if (organizationId) {
      query = query.where(
        "project_id",
        "in",
        executor.selectFrom("projects").select("id").where("organization_id", "=", organizationId),
      );
    }

    if (input?.projectId) {
      query = query.where("project_id", "=", input.projectId);
    }

    if (input?.environmentId) {
      query = query.where("environment_id", "=", input.environmentId);
    }

    if (input?.resourceId) {
      query = query.where("resource_id", "=", input.resourceId);
    }

    if (input?.status) {
      query = query.where("status", "=", input.status);
    }

    if (input?.repositoryFullName) {
      query = query.where("repository_full_name", "=", input.repositoryFullName);
    }

    if (input?.pullRequestNumber) {
      query = query.where("pull_request_number", "=", input.pullRequestNumber);
    }

    if (input?.cursor) {
      query = query.where("updated_at", "<", input.cursor);
    }

    const rows = await query.orderBy("updated_at", "desc").orderBy("id", "desc").execute();
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? pageRows.at(-1)?.updated_at : undefined;

    return {
      items: pageRows.map(summaryFromRow),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async findOne(
    context: RepositoryContext,
    input: Parameters<PreviewEnvironmentReadModel["findOne"]>[1],
  ): Promise<PreviewEnvironmentSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    let query = executor
      .selectFrom("preview_environments")
      .selectAll()
      .where("id", "=", input.previewEnvironmentId);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    if (organizationId) {
      query = query.where(
        "project_id",
        "in",
        executor.selectFrom("projects").select("id").where("organization_id", "=", organizationId),
      );
    }

    if (input.projectId) {
      query = query.where("project_id", "=", input.projectId);
    }

    if (input.resourceId) {
      query = query.where("resource_id", "=", input.resourceId);
    }

    const row = await query.executeTakeFirst();
    return row ? summaryFromRow(row) : null;
  }
}

export class PgPreviewExpiredEnvironmentCandidateReader
  implements PreviewExpiredEnvironmentCandidateReader
{
  constructor(private readonly db: Kysely<Database>) {}

  async listExpiredActive(
    context: RepositoryContext,
    input: {
      now: string;
      limit: number;
    },
  ): Promise<PreviewExpiredEnvironmentCandidate[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("preview_environment", "list_expired_active"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_environment",
          [appaloftTraceAttributes.selectionSpecName]: "PreviewExpiredEnvironmentCandidateReader",
        },
      },
      async () => {
        const rows = await executor
          .selectFrom("preview_environments")
          .select(["id", "resource_id", "expires_at"])
          .where("status", "=", "active")
          .where("expires_at", "is not", null)
          .where("expires_at", "<=", input.now)
          .orderBy("expires_at", "asc")
          .orderBy("id", "asc")
          .limit(input.limit)
          .execute();

        return rows.flatMap((row) => {
          const expiresAt = normalizeTimestamp(row.expires_at);
          return expiresAt
            ? [
                {
                  previewEnvironmentId: row.id,
                  resourceId: row.resource_id,
                  expiresAt,
                },
              ]
            : [];
        });
      },
    );
  }
}

function previewEnvironmentFromRow(row: PreviewEnvironmentRow): PreviewEnvironment {
  return PreviewEnvironment.rehydrate({
    id: PreviewEnvironmentId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    resourceId: ResourceId.rehydrate(row.resource_id),
    serverId: DeploymentTargetId.rehydrate(row.server_id),
    destinationId: DestinationId.rehydrate(row.destination_id),
    provider: PreviewEnvironmentProviderValue.rehydrate(row.provider as "github"),
    source: {
      repositoryFullName: SourceRepositoryFullName.rehydrate(row.repository_full_name),
      headRepositoryFullName: SourceRepositoryFullName.rehydrate(row.head_repository_full_name),
      pullRequestNumber: PreviewPullRequestNumber.rehydrate(row.pull_request_number),
      headSha: GitCommitShaText.rehydrate(row.head_sha),
      baseRef: GitRefText.rehydrate(row.base_ref),
      sourceBindingFingerprint: SourceBindingFingerprint.rehydrate(row.source_binding_fingerprint),
    },
    status: PreviewEnvironmentStatusValue.rehydrate(row.status as PreviewEnvironmentStatus),
    createdAt: CreatedAt.rehydrate(row.created_at),
    updatedAt: UpdatedAt.rehydrate(row.updated_at),
    ...(row.expires_at ? { expiresAt: PreviewEnvironmentExpiresAt.rehydrate(row.expires_at) } : {}),
  });
}

function summaryFromRow(row: PreviewEnvironmentRow): PreviewEnvironmentSummary {
  return {
    previewEnvironmentId: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    serverId: row.server_id,
    destinationId: row.destination_id,
    source: {
      provider: row.provider as "github",
      repositoryFullName: row.repository_full_name,
      headRepositoryFullName: row.head_repository_full_name,
      pullRequestNumber: row.pull_request_number,
      baseRef: row.base_ref,
      headSha: row.head_sha,
      sourceBindingFingerprint: row.source_binding_fingerprint,
    },
    status: row.status as PreviewEnvironmentStatus,
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    updatedAt: normalizeTimestamp(row.updated_at) ?? row.updated_at,
    ...(row.expires_at ? { expiresAt: normalizeTimestamp(row.expires_at) ?? row.expires_at } : {}),
  };
}
