import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type DependencyResourceDeleteBlocker,
  type DependencyResourceDeleteSafetyReader,
  type DependencyResourceReadModel,
  type DependencyResourceRepository,
  type DependencyResourceSummary,
  type RepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DeletedAt,
  DependencyResourceDatabaseName,
  DependencyResourceEndpointHost,
  DependencyResourceEndpointPort,
  DependencyResourceProviderFailureCode,
  DependencyResourceProviderRealizationAttemptId,
  DependencyResourceProviderRealizationStatusValue,
  DependencyResourceProviderResourceHandle,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  DescriptionText,
  EnvironmentId,
  MaskedDependencyConnection,
  OccurredAt,
  OwnerId,
  OwnerScopeValue,
  ok,
  ProjectId,
  ProviderKey,
  ResourceInstance,
  type ResourceInstanceByEnvironmentAndSlugSpec,
  type ResourceInstanceByIdSpec,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  type ResourceInstanceMutationSpec,
  type ResourceInstanceMutationSpecVisitor,
  ResourceInstanceName,
  type ResourceInstanceSelectionSpec,
  type ResourceInstanceSelectionSpecVisitor,
  ResourceInstanceSlug,
  ResourceInstanceStatusValue,
  type Result,
  type UpsertResourceInstanceSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor, withRepositoryTransaction } from "./shared";

type DependencyResourceSelectionQuery = SelectQueryBuilder<
  Database,
  "dependency_resources",
  Selectable<Database["dependency_resources"]>
>;
type DependencyResourceRow = Selectable<Database["dependency_resources"]>;

interface SerializedDependencyEndpoint extends Record<string, unknown> {
  host: string;
  port?: number;
  databaseName?: string;
  maskedConnection: string;
}

interface SerializedDependencyBackupRelationship extends Record<string, unknown> {
  retentionRequired: boolean;
  reason?: string;
}

interface SerializedDependencyBindingReadiness extends Record<string, unknown> {
  status: "ready" | "blocked" | "not-implemented";
  reason?: string;
}

interface SerializedDependencyProviderRealization extends Record<string, unknown> {
  status: "pending" | "ready" | "failed" | "delete-pending" | "deleted";
  attemptId: string;
  attemptedAt: string;
  providerResourceHandle?: string;
  realizedAt?: string;
  failedAt?: string;
  failureCode?: string;
  failureMessage?: string;
}

class KyselyResourceInstanceSelectionVisitor
  implements ResourceInstanceSelectionSpecVisitor<DependencyResourceSelectionQuery>
{
  visitResourceInstanceById(
    query: DependencyResourceSelectionQuery,
    spec: ResourceInstanceByIdSpec,
  ): DependencyResourceSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitResourceInstanceByEnvironmentAndSlug(
    query: DependencyResourceSelectionQuery,
    spec: ResourceInstanceByEnvironmentAndSlugSpec,
  ): DependencyResourceSelectionQuery {
    return query
      .where("project_id", "=", spec.projectId.value)
      .where("environment_id", "=", spec.environmentId.value)
      .where("kind", "=", spec.kind.value)
      .where("slug", "=", spec.slug.value);
  }
}

class KyselyResourceInstanceMutationVisitor
  implements
    ResourceInstanceMutationSpecVisitor<{
      dependencyResource: Insertable<Database["dependency_resources"]>;
    }>
{
  visitUpsertResourceInstance(spec: UpsertResourceInstanceSpec) {
    const state = spec.state;
    const dependencyEndpoint = state.postgresEndpoint ?? state.redisEndpoint;
    const endpoint = dependencyEndpoint
      ? ({
          host: dependencyEndpoint.host.value,
          ...(dependencyEndpoint.port ? { port: dependencyEndpoint.port.value } : {}),
          ...(dependencyEndpoint.databaseName
            ? { databaseName: dependencyEndpoint.databaseName.value }
            : {}),
          maskedConnection: dependencyEndpoint.maskedConnection.value,
        } satisfies SerializedDependencyEndpoint)
      : null;
    const backupRelationship = state.backupRelationship
      ? ({
          retentionRequired: state.backupRelationship.retentionRequired,
          ...(state.backupRelationship.reason
            ? { reason: state.backupRelationship.reason.value }
            : {}),
        } satisfies SerializedDependencyBackupRelationship)
      : null;
    const bindingReadiness = state.bindingReadiness
      ? ({
          status: state.bindingReadiness.status,
          ...(state.bindingReadiness.reason ? { reason: state.bindingReadiness.reason.value } : {}),
        } satisfies SerializedDependencyBindingReadiness)
      : null;
    const providerRealization = state.providerRealization
      ? ({
          status: state.providerRealization.status.value,
          attemptId: state.providerRealization.attemptId.value,
          attemptedAt: state.providerRealization.attemptedAt.value,
          ...(state.providerRealization.providerResourceHandle
            ? {
                providerResourceHandle: state.providerRealization.providerResourceHandle.value,
              }
            : {}),
          ...(state.providerRealization.realizedAt
            ? { realizedAt: state.providerRealization.realizedAt.value }
            : {}),
          ...(state.providerRealization.failedAt
            ? { failedAt: state.providerRealization.failedAt.value }
            : {}),
          ...(state.providerRealization.failureCode
            ? { failureCode: state.providerRealization.failureCode.value }
            : {}),
          ...(state.providerRealization.failureMessage
            ? { failureMessage: state.providerRealization.failureMessage.value }
            : {}),
        } satisfies SerializedDependencyProviderRealization)
      : null;

    return {
      dependencyResource: {
        id: state.id.value,
        project_id: state.projectId?.value ?? state.ownerId.value,
        environment_id: state.environmentId?.value ?? "",
        name: state.name.value,
        slug: state.slug?.value ?? state.name.value.toLowerCase(),
        kind: state.kind.value,
        source_mode: state.sourceMode?.value ?? "appaloft-managed",
        provider_key: state.providerKey.value,
        provider_managed: state.providerManaged ?? false,
        description: state.description?.value ?? null,
        endpoint,
        connection_secret_ref: state.connectionSecretRef?.value ?? null,
        provider_realization: providerRealization,
        backup_relationship: backupRelationship,
        binding_readiness: bindingReadiness,
        lifecycle_status: state.status.value,
        created_at: state.createdAt.value,
        deleted_at: state.deletedAt?.value ?? null,
      },
    };
  }
}

function deserializeEndpoint(
  endpoint: Record<string, unknown> | null,
): SerializedDependencyEndpoint | undefined {
  if (!endpoint) {
    return undefined;
  }
  return endpoint as SerializedDependencyEndpoint;
}

function rehydrateResourceInstance(row: DependencyResourceRow): ResourceInstance {
  const endpoint = deserializeEndpoint(row.endpoint);
  const backupRelationship = row.backup_relationship
    ? (row.backup_relationship as SerializedDependencyBackupRelationship)
    : undefined;
  const bindingReadiness = row.binding_readiness
    ? (row.binding_readiness as SerializedDependencyBindingReadiness)
    : undefined;
  const providerRealization = row.provider_realization
    ? (row.provider_realization as SerializedDependencyProviderRealization)
    : undefined;

  return ResourceInstance.rehydrate({
    id: ResourceInstanceId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    kind: ResourceInstanceKindValue.rehydrate(
      row.kind as Parameters<typeof ResourceInstanceKindValue.rehydrate>[0],
    ),
    ownerScope: OwnerScopeValue.rehydrate("project"),
    ownerId: OwnerId.rehydrate(row.project_id),
    name: ResourceInstanceName.rehydrate(row.name),
    slug: ResourceInstanceSlug.rehydrate(row.slug),
    sourceMode: DependencyResourceSourceModeValue.rehydrate(
      row.source_mode as Parameters<typeof DependencyResourceSourceModeValue.rehydrate>[0],
    ),
    providerKey: ProviderKey.rehydrate(row.provider_key),
    providerManaged: row.provider_managed,
    ...(row.description ? { description: DescriptionText.rehydrate(row.description) } : {}),
    ...(endpoint && row.kind === "redis"
      ? {
          redisEndpoint: {
            host: DependencyResourceEndpointHost.rehydrate(endpoint.host),
            ...(endpoint.port
              ? { port: DependencyResourceEndpointPort.rehydrate(endpoint.port) }
              : {}),
            ...(endpoint.databaseName
              ? { databaseName: DependencyResourceDatabaseName.rehydrate(endpoint.databaseName) }
              : {}),
            maskedConnection: MaskedDependencyConnection.rehydrate(endpoint.maskedConnection),
          },
        }
      : endpoint
        ? {
            postgresEndpoint: {
              host: DependencyResourceEndpointHost.rehydrate(endpoint.host),
              ...(endpoint.port
                ? { port: DependencyResourceEndpointPort.rehydrate(endpoint.port) }
                : {}),
              ...(endpoint.databaseName
                ? { databaseName: DependencyResourceDatabaseName.rehydrate(endpoint.databaseName) }
                : {}),
              maskedConnection: MaskedDependencyConnection.rehydrate(endpoint.maskedConnection),
            },
          }
        : {}),
    ...(row.connection_secret_ref
      ? { connectionSecretRef: DependencyResourceSecretRef.rehydrate(row.connection_secret_ref) }
      : {}),
    ...(providerRealization
      ? {
          providerRealization: {
            status: DependencyResourceProviderRealizationStatusValue.rehydrate(
              providerRealization.status,
            ),
            attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate(
              providerRealization.attemptId,
            ),
            attemptedAt: OccurredAt.rehydrate(providerRealization.attemptedAt),
            ...(providerRealization.providerResourceHandle
              ? {
                  providerResourceHandle: DependencyResourceProviderResourceHandle.rehydrate(
                    providerRealization.providerResourceHandle,
                  ),
                }
              : {}),
            ...(providerRealization.realizedAt
              ? { realizedAt: OccurredAt.rehydrate(providerRealization.realizedAt) }
              : {}),
            ...(providerRealization.failedAt
              ? { failedAt: OccurredAt.rehydrate(providerRealization.failedAt) }
              : {}),
            ...(providerRealization.failureCode
              ? {
                  failureCode: DependencyResourceProviderFailureCode.rehydrate(
                    providerRealization.failureCode,
                  ),
                }
              : {}),
            ...(providerRealization.failureMessage
              ? { failureMessage: DescriptionText.rehydrate(providerRealization.failureMessage) }
              : {}),
          },
        }
      : {}),
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
    ...(bindingReadiness
      ? {
          bindingReadiness: {
            status: bindingReadiness.status,
            ...(bindingReadiness.reason
              ? { reason: DescriptionText.rehydrate(bindingReadiness.reason) }
              : {}),
          },
        }
      : {}),
    status: ResourceInstanceStatusValue.rehydrate(
      row.lifecycle_status as Parameters<typeof ResourceInstanceStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.deleted_at
      ? { deletedAt: DeletedAt.rehydrate(normalizeTimestamp(row.deleted_at) ?? row.deleted_at) }
      : {}),
  });
}

function toDependencyResourceSummary(
  row: DependencyResourceRow,
  blockers: DependencyResourceDeleteBlocker[],
): DependencyResourceSummary {
  const endpoint = deserializeEndpoint(row.endpoint);
  const backupRelationship = row.backup_relationship
    ? (row.backup_relationship as SerializedDependencyBackupRelationship)
    : undefined;
  const bindingReadiness = row.binding_readiness
    ? (row.binding_readiness as SerializedDependencyBindingReadiness)
    : undefined;
  const providerRealization = row.provider_realization
    ? (row.provider_realization as SerializedDependencyProviderRealization)
    : undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as DependencyResourceSummary["kind"],
    sourceMode: row.source_mode as DependencyResourceSummary["sourceMode"],
    providerKey: row.provider_key,
    providerManaged: row.provider_managed,
    ...(row.description ? { description: row.description } : {}),
    lifecycleStatus: row.lifecycle_status as DependencyResourceSummary["lifecycleStatus"],
    ...(endpoint
      ? {
          connection: {
            host: endpoint.host,
            ...(endpoint.port ? { port: endpoint.port } : {}),
            ...(endpoint.databaseName ? { databaseName: endpoint.databaseName } : {}),
            maskedConnection: endpoint.maskedConnection,
            ...(row.connection_secret_ref ? { secretRef: row.connection_secret_ref } : {}),
          },
        }
      : {}),
    ...(providerRealization
      ? {
          providerRealization: {
            status: providerRealization.status,
            attemptId: providerRealization.attemptId,
            attemptedAt: providerRealization.attemptedAt,
            ...(providerRealization.providerResourceHandle
              ? { providerResourceHandle: providerRealization.providerResourceHandle }
              : {}),
            ...(providerRealization.realizedAt
              ? { realizedAt: providerRealization.realizedAt }
              : {}),
            ...(providerRealization.failedAt ? { failedAt: providerRealization.failedAt } : {}),
            ...(providerRealization.failureCode
              ? { failureCode: providerRealization.failureCode }
              : {}),
            ...(providerRealization.failureMessage
              ? { failureMessage: providerRealization.failureMessage }
              : {}),
          },
        }
      : {}),
    bindingReadiness: {
      status: bindingReadiness?.status ?? "not-implemented",
      ...(bindingReadiness?.reason ? { reason: bindingReadiness.reason } : {}),
    },
    ...(backupRelationship
      ? {
          backupRelationship: {
            retentionRequired: backupRelationship.retentionRequired,
            ...(backupRelationship.reason ? { reason: backupRelationship.reason } : {}),
          },
        }
      : {}),
    deleteSafety: {
      blockers,
    },
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(row.deleted_at ? { deletedAt: normalizeTimestamp(row.deleted_at) ?? row.deleted_at } : {}),
  };
}

export class PgDependencyResourceRepository implements DependencyResourceRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: ResourceInstanceSelectionSpec,
  ): Promise<ResourceInstance | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("dependency-resource", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "dependency-resource",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("dependency_resources").selectAll(),
            new KyselyResourceInstanceSelectionVisitor(),
          )
          .executeTakeFirst();
        return row ? rehydrateResourceInstance(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    dependencyResource: ResourceInstance,
    spec: ResourceInstanceMutationSpec,
  ): Promise<void> {
    void dependencyResource;
    const mutation = spec.accept(new KyselyResourceInstanceMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("dependency-resource", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "dependency-resource",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("dependency_resources")
            .values(mutation.dependencyResource)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                name: mutation.dependencyResource.name,
                slug: mutation.dependencyResource.slug,
                description: mutation.dependencyResource.description,
                endpoint: mutation.dependencyResource.endpoint,
                connection_secret_ref: mutation.dependencyResource.connection_secret_ref,
                backup_relationship: mutation.dependencyResource.backup_relationship,
                binding_readiness: mutation.dependencyResource.binding_readiness,
                lifecycle_status: mutation.dependencyResource.lifecycle_status,
                deleted_at: mutation.dependencyResource.deleted_at,
              }),
            )
            .execute();
        });
      },
    );
  }
}

export class PgDependencyResourceDeleteSafetyReader
  implements DependencyResourceDeleteSafetyReader
{
  constructor(private readonly db: Kysely<Database>) {}

  async findBlockers(
    context: RepositoryContext,
    input: { dependencyResourceId: string },
  ): Promise<Result<DependencyResourceDeleteBlocker[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const row = await executor
      .selectFrom("resource_dependency_bindings")
      .select((expressionBuilder) => [expressionBuilder.fn.count<number>("id").as("count")])
      .where("dependency_resource_id", "=", input.dependencyResourceId)
      .where("lifecycle_status", "=", "active")
      .executeTakeFirst();
    const count = Number(row?.count ?? 0);
    return ok(count > 0 ? [{ kind: "resource-binding", count }] : []);
  }
}

export class PgDependencyResourceReadModel implements DependencyResourceReadModel {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly deleteSafetyReader: DependencyResourceDeleteSafetyReader = new PgDependencyResourceDeleteSafetyReader(
      db,
    ),
  ) {}

  async list(
    context: RepositoryContext,
    input?: { projectId?: string; environmentId?: string; kind?: "postgres" | "redis" },
  ): Promise<DependencyResourceSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("dependency-resource", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "dependency-resource",
        },
      },
      async () => {
        let query = executor
          .selectFrom("dependency_resources")
          .selectAll()
          .where("lifecycle_status", "!=", "deleted")
          .orderBy("created_at", "desc");
        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }
        if (input?.environmentId) {
          query = query.where("environment_id", "=", input.environmentId);
        }
        if (input?.kind) {
          query = query.where("kind", "=", input.kind);
        }
        const rows = await query.execute();
        const summaries: DependencyResourceSummary[] = [];
        for (const row of rows) {
          const blockers = await this.deleteSafetyReader.findBlockers(context, {
            dependencyResourceId: row.id,
          });
          summaries.push(toDependencyResourceSummary(row, blockers.isOk() ? blockers.value : []));
        }
        return summaries;
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: ResourceInstanceSelectionSpec,
  ): Promise<DependencyResourceSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("dependency-resource", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "dependency-resource",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor
              .selectFrom("dependency_resources")
              .selectAll()
              .where("lifecycle_status", "!=", "deleted"),
            new KyselyResourceInstanceSelectionVisitor(),
          )
          .executeTakeFirst();
        if (!row) {
          return null;
        }
        const blockers = await this.deleteSafetyReader.findBlockers(context, {
          dependencyResourceId: row.id,
        });
        return toDependencyResourceSummary(row, blockers.isOk() ? blockers.value : []);
      },
    );
  }
}
