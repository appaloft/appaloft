import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type RepositoryContext,
  type ResourceDependencyBindingReadModel,
  type ResourceDependencyBindingRepository,
  type ResourceDependencyBindingSummary,
} from "@appaloft/application";
import {
  type ActiveResourceBindingByTargetSpec,
  CreatedAt,
  EnvironmentId,
  ok,
  ProjectId,
  ResourceBinding,
  type ResourceBindingByIdSpec,
  ResourceBindingId,
  type ResourceBindingMutationSpec,
  type ResourceBindingMutationSpecVisitor,
  ResourceBindingScopeValue,
  type ResourceBindingSelectionSpec,
  type ResourceBindingSelectionSpecVisitor,
  ResourceBindingStatusValue,
  type ResourceBindingsByResourceSpec,
  ResourceBindingTargetName,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  type Result,
  UpdatedAt,
  type UpsertResourceBindingSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor, withRepositoryTransaction } from "./shared";

type BindingSelectionQuery = SelectQueryBuilder<
  Database,
  "resource_dependency_bindings",
  Selectable<Database["resource_dependency_bindings"]>
>;
type BindingRow = Selectable<Database["resource_dependency_bindings"]>;

type BindingSummaryRow = BindingRow & {
  dependency_name: string | null;
  dependency_slug: string | null;
  dependency_kind: string | null;
  dependency_source_mode: string | null;
  dependency_provider_key: string | null;
  dependency_provider_managed: boolean | null;
  dependency_lifecycle_status: string | null;
  dependency_endpoint: Record<string, unknown> | null;
  dependency_connection_secret_ref: string | null;
};

interface SerializedDependencyEndpoint extends Record<string, unknown> {
  host: string;
  port?: number;
  databaseName?: string;
  maskedConnection: string;
}

class KyselyResourceBindingSelectionVisitor
  implements ResourceBindingSelectionSpecVisitor<BindingSelectionQuery>
{
  visitResourceBindingById(
    query: BindingSelectionQuery,
    spec: ResourceBindingByIdSpec,
  ): BindingSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitActiveResourceBindingByTarget(
    query: BindingSelectionQuery,
    spec: ActiveResourceBindingByTargetSpec,
  ): BindingSelectionQuery {
    return query
      .where("resource_id", "=", spec.resourceId.value)
      .where("dependency_resource_id", "=", spec.resourceInstanceId.value)
      .where("target_name", "=", spec.targetName.value)
      .where("lifecycle_status", "=", "active");
  }

  visitResourceBindingsByResource(
    query: BindingSelectionQuery,
    spec: ResourceBindingsByResourceSpec,
  ): BindingSelectionQuery {
    return query
      .where("resource_id", "=", spec.resourceId.value)
      .where("lifecycle_status", "=", "active");
  }
}

class KyselyResourceBindingMutationVisitor
  implements
    ResourceBindingMutationSpecVisitor<{
      binding: Insertable<Database["resource_dependency_bindings"]>;
    }>
{
  visitUpsertResourceBinding(spec: UpsertResourceBindingSpec) {
    const state = spec.state;
    return {
      binding: {
        id: state.id.value,
        project_id: state.projectId.value,
        environment_id: state.environmentId.value,
        resource_id: state.resourceId.value,
        dependency_resource_id: state.resourceInstanceId.value,
        target_name: state.targetName.value,
        scope: state.scope.value,
        injection_mode: state.injectionMode.value,
        lifecycle_status: state.status.value,
        created_at: state.createdAt.value,
        removed_at: state.removedAt?.value ?? null,
      },
    };
  }
}

function rehydrateBinding(row: BindingRow): ResourceBinding {
  return ResourceBinding.rehydrate({
    id: ResourceBindingId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    resourceId: ResourceId.rehydrate(row.resource_id),
    resourceInstanceId: ResourceInstanceId.rehydrate(row.dependency_resource_id),
    targetName: ResourceBindingTargetName.rehydrate(row.target_name),
    scope: ResourceBindingScopeValue.rehydrate(
      row.scope as Parameters<typeof ResourceBindingScopeValue.rehydrate>[0],
    ),
    injectionMode: ResourceInjectionModeValue.rehydrate(
      row.injection_mode as Parameters<typeof ResourceInjectionModeValue.rehydrate>[0],
    ),
    status: ResourceBindingStatusValue.rehydrate(
      row.lifecycle_status as Parameters<typeof ResourceBindingStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.removed_at
      ? { removedAt: UpdatedAt.rehydrate(normalizeTimestamp(row.removed_at) ?? row.removed_at) }
      : {}),
  });
}

function deserializeEndpoint(
  endpoint: Record<string, unknown> | null,
): SerializedDependencyEndpoint | undefined {
  if (!endpoint) {
    return undefined;
  }
  return endpoint as SerializedDependencyEndpoint;
}

function toSummary(row: BindingSummaryRow): ResourceDependencyBindingSummary {
  const endpoint = deserializeEndpoint(row.dependency_endpoint);
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    dependencyResourceId: row.dependency_resource_id,
    ...(row.dependency_name ? { dependencyResourceName: row.dependency_name } : {}),
    ...(row.dependency_slug ? { dependencyResourceSlug: row.dependency_slug } : {}),
    kind: (row.dependency_kind ?? "postgres") as ResourceDependencyBindingSummary["kind"],
    sourceMode: (row.dependency_source_mode ??
      "appaloft-managed") as ResourceDependencyBindingSummary["sourceMode"],
    providerKey: row.dependency_provider_key ?? "",
    providerManaged: row.dependency_provider_managed ?? false,
    lifecycleStatus: (row.dependency_lifecycle_status ??
      "ready") as ResourceDependencyBindingSummary["lifecycleStatus"],
    target: {
      targetName: row.target_name,
      scope: row.scope as ResourceDependencyBindingSummary["target"]["scope"],
      injectionMode:
        row.injection_mode as ResourceDependencyBindingSummary["target"]["injectionMode"],
      ...(row.dependency_connection_secret_ref
        ? { secretRef: row.dependency_connection_secret_ref }
        : {}),
    },
    ...(endpoint
      ? {
          connection: {
            host: endpoint.host,
            ...(endpoint.port ? { port: endpoint.port } : {}),
            ...(endpoint.databaseName ? { databaseName: endpoint.databaseName } : {}),
            maskedConnection: endpoint.maskedConnection,
            ...(row.dependency_connection_secret_ref
              ? { secretRef: row.dependency_connection_secret_ref }
              : {}),
          },
        }
      : {}),
    bindingReadiness: {
      status: "ready",
    },
    snapshotReadiness: {
      status:
        row.dependency_lifecycle_status === "ready" && row.lifecycle_status === "active"
          ? "ready"
          : "blocked",
      ...(row.dependency_lifecycle_status === "ready" && row.lifecycle_status === "active"
        ? {}
        : { reason: "dependency binding is not ready for deployment snapshot reference" }),
    },
    status: row.lifecycle_status as ResourceDependencyBindingSummary["status"],
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(row.removed_at ? { removedAt: normalizeTimestamp(row.removed_at) ?? row.removed_at } : {}),
  };
}

export class PgResourceDependencyBindingRepository implements ResourceDependencyBindingRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: ResourceBindingSelectionSpec,
  ): Promise<ResourceBinding | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("resource-dependency-binding", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "resource-dependency-binding",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("resource_dependency_bindings").selectAll(),
            new KyselyResourceBindingSelectionVisitor(),
          )
          .executeTakeFirst();
        return row ? rehydrateBinding(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    resourceBinding: ResourceBinding,
    spec: ResourceBindingMutationSpec,
  ): Promise<void> {
    void resourceBinding;
    const mutation = spec.accept(new KyselyResourceBindingMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("resource-dependency-binding", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "resource-dependency-binding",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("resource_dependency_bindings")
            .values(mutation.binding)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                lifecycle_status: mutation.binding.lifecycle_status,
                removed_at: mutation.binding.removed_at,
              }),
            )
            .execute();
        });
      },
    );
  }
}

export class PgResourceDependencyBindingReadModel implements ResourceDependencyBindingReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: { resourceId: string },
  ): Promise<Result<ResourceDependencyBindingSummary[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource-dependency-binding", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "resource-dependency-binding",
        },
      },
      async () => {
        const rows = await executor
          .selectFrom("resource_dependency_bindings")
          .leftJoin(
            "dependency_resources",
            "dependency_resources.id",
            "resource_dependency_bindings.dependency_resource_id",
          )
          .selectAll("resource_dependency_bindings")
          .select([
            "dependency_resources.name as dependency_name",
            "dependency_resources.slug as dependency_slug",
            "dependency_resources.kind as dependency_kind",
            "dependency_resources.source_mode as dependency_source_mode",
            "dependency_resources.provider_key as dependency_provider_key",
            "dependency_resources.provider_managed as dependency_provider_managed",
            "dependency_resources.lifecycle_status as dependency_lifecycle_status",
            "dependency_resources.endpoint as dependency_endpoint",
            "dependency_resources.connection_secret_ref as dependency_connection_secret_ref",
          ])
          .where("resource_dependency_bindings.resource_id", "=", input.resourceId)
          .where("resource_dependency_bindings.lifecycle_status", "=", "active")
          .orderBy("resource_dependency_bindings.created_at", "desc")
          .execute();
        return ok(rows.map((row) => toSummary(row as BindingSummaryRow)));
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    input: { resourceId: string; bindingId: string },
  ): Promise<Result<ResourceDependencyBindingSummary | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource-dependency-binding", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "resource-dependency-binding",
        },
      },
      async () => {
        const row = await executor
          .selectFrom("resource_dependency_bindings")
          .leftJoin(
            "dependency_resources",
            "dependency_resources.id",
            "resource_dependency_bindings.dependency_resource_id",
          )
          .selectAll("resource_dependency_bindings")
          .select([
            "dependency_resources.name as dependency_name",
            "dependency_resources.slug as dependency_slug",
            "dependency_resources.kind as dependency_kind",
            "dependency_resources.source_mode as dependency_source_mode",
            "dependency_resources.provider_key as dependency_provider_key",
            "dependency_resources.provider_managed as dependency_provider_managed",
            "dependency_resources.lifecycle_status as dependency_lifecycle_status",
            "dependency_resources.endpoint as dependency_endpoint",
            "dependency_resources.connection_secret_ref as dependency_connection_secret_ref",
          ])
          .where("resource_dependency_bindings.resource_id", "=", input.resourceId)
          .where("resource_dependency_bindings.id", "=", input.bindingId)
          .where("resource_dependency_bindings.lifecycle_status", "=", "active")
          .executeTakeFirst();
        return ok(row ? toSummary(row as BindingSummaryRow) : null);
      },
    );
  }
}
