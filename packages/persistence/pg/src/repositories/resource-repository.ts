import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type RepositoryContext,
  type ResourceRepository,
} from "@appaloft/application";
import {
  Resource,
  type ResourceByEnvironmentAndSlugSpec,
  type ResourceByIdSpec,
  type ResourceMutationSpec,
  type ResourceMutationSpecVisitor,
  type ResourceSelectionSpec,
  type ResourceSelectionSpecVisitor,
  ResourceSourceBinding,
  type UpsertResourceSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  type RepositoryExecutor,
  rehydrateResourceRow,
  resolveRepositoryExecutor,
  type SerializedResourceAccessProfile,
  type SerializedResourceNetworkProfile,
  type SerializedResourceRuntimeProfile,
  type SerializedResourceSourceBinding,
  serializeEnvironmentVariables,
  serializeHealthCheckPolicy,
  serializeResourceServices,
  withRepositoryTransaction,
} from "./shared";

type ResourceSelectionQuery = SelectQueryBuilder<
  Database,
  "resources",
  Selectable<Database["resources"]>
>;

class KyselyResourceSelectionVisitor
  implements ResourceSelectionSpecVisitor<ResourceSelectionQuery>
{
  visitResourceById(query: ResourceSelectionQuery, spec: ResourceByIdSpec): ResourceSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitResourceByEnvironmentAndSlug(
    query: ResourceSelectionQuery,
    spec: ResourceByEnvironmentAndSlugSpec,
  ): ResourceSelectionQuery {
    return query
      .where("project_id", "=", spec.projectId.value)
      .where("environment_id", "=", spec.environmentId.value)
      .where("slug", "=", spec.slug.value);
  }
}

class KyselyResourceMutationVisitor
  implements
    ResourceMutationSpecVisitor<{
      resource: Insertable<Database["resources"]>;
      variables: Insertable<Database["resource_variables"]>[];
    }>
{
  visitUpsertResource(spec: UpsertResourceSpec) {
    const sourceBindingMetadata = spec.state.sourceBinding
      ? ResourceSourceBinding.metadataFromState(spec.state.sourceBinding)
      : undefined;
    const sourceBinding = spec.state.sourceBinding
      ? ({
          kind: spec.state.sourceBinding.kind.value,
          locator: spec.state.sourceBinding.locator.value,
          displayName: spec.state.sourceBinding.displayName.value,
          ...(spec.state.sourceBinding.gitRef
            ? { gitRef: spec.state.sourceBinding.gitRef.value }
            : {}),
          ...(spec.state.sourceBinding.commitSha
            ? { commitSha: spec.state.sourceBinding.commitSha.value }
            : {}),
          ...(spec.state.sourceBinding.baseDirectory
            ? { baseDirectory: spec.state.sourceBinding.baseDirectory.value }
            : {}),
          ...(spec.state.sourceBinding.originalLocator
            ? { originalLocator: spec.state.sourceBinding.originalLocator.value }
            : {}),
          ...(spec.state.sourceBinding.repositoryId
            ? { repositoryId: spec.state.sourceBinding.repositoryId.value }
            : {}),
          ...(spec.state.sourceBinding.repositoryFullName
            ? { repositoryFullName: spec.state.sourceBinding.repositoryFullName.value }
            : {}),
          ...(spec.state.sourceBinding.defaultBranch
            ? { defaultBranch: spec.state.sourceBinding.defaultBranch.value }
            : {}),
          ...(spec.state.sourceBinding.imageName
            ? { imageName: spec.state.sourceBinding.imageName.value }
            : {}),
          ...(spec.state.sourceBinding.imageTag
            ? { imageTag: spec.state.sourceBinding.imageTag.value }
            : {}),
          ...(spec.state.sourceBinding.imageDigest
            ? { imageDigest: spec.state.sourceBinding.imageDigest.value }
            : {}),
          ...(sourceBindingMetadata ? { metadata: sourceBindingMetadata } : {}),
        } satisfies SerializedResourceSourceBinding)
      : null;
    const runtimeProfile = spec.state.runtimeProfile
      ? ({
          strategy: spec.state.runtimeProfile.strategy.value,
          ...(spec.state.runtimeProfile.installCommand
            ? { installCommand: spec.state.runtimeProfile.installCommand.value }
            : {}),
          ...(spec.state.runtimeProfile.buildCommand
            ? { buildCommand: spec.state.runtimeProfile.buildCommand.value }
            : {}),
          ...(spec.state.runtimeProfile.startCommand
            ? { startCommand: spec.state.runtimeProfile.startCommand.value }
            : {}),
          ...(spec.state.runtimeProfile.runtimeName
            ? { runtimeName: spec.state.runtimeProfile.runtimeName.value }
            : {}),
          ...(spec.state.runtimeProfile.publishDirectory
            ? { publishDirectory: spec.state.runtimeProfile.publishDirectory.value }
            : {}),
          ...(spec.state.runtimeProfile.dockerfilePath
            ? { dockerfilePath: spec.state.runtimeProfile.dockerfilePath.value }
            : {}),
          ...(spec.state.runtimeProfile.dockerComposeFilePath
            ? { dockerComposeFilePath: spec.state.runtimeProfile.dockerComposeFilePath.value }
            : {}),
          ...(spec.state.runtimeProfile.buildTarget
            ? { buildTarget: spec.state.runtimeProfile.buildTarget.value }
            : {}),
          ...(spec.state.runtimeProfile.healthCheckPath
            ? { healthCheckPath: spec.state.runtimeProfile.healthCheckPath.value }
            : {}),
          ...(spec.state.runtimeProfile.healthCheck
            ? { healthCheck: serializeHealthCheckPolicy(spec.state.runtimeProfile.healthCheck) }
            : {}),
        } satisfies SerializedResourceRuntimeProfile)
      : null;
    const networkProfile = spec.state.networkProfile
      ? ({
          internalPort: spec.state.networkProfile.internalPort.value,
          upstreamProtocol: spec.state.networkProfile.upstreamProtocol.value,
          exposureMode: spec.state.networkProfile.exposureMode.value,
          ...(spec.state.networkProfile.targetServiceName
            ? { targetServiceName: spec.state.networkProfile.targetServiceName.value }
            : {}),
          ...(spec.state.networkProfile.hostPort
            ? { hostPort: spec.state.networkProfile.hostPort.value }
            : {}),
        } satisfies SerializedResourceNetworkProfile)
      : null;
    const accessProfile = spec.state.accessProfile
      ? ({
          generatedAccessMode: spec.state.accessProfile.generatedAccessMode.value,
          pathPrefix: spec.state.accessProfile.pathPrefix.value,
        } satisfies SerializedResourceAccessProfile)
      : null;

    return {
      resource: {
        id: spec.state.id.value,
        project_id: spec.state.projectId.value,
        environment_id: spec.state.environmentId.value,
        destination_id: spec.state.destinationId?.value ?? null,
        name: spec.state.name.value,
        slug: spec.state.slug.value,
        kind: spec.state.kind.value,
        description: spec.state.description?.value ?? null,
        services: serializeResourceServices(spec.state.services),
        source_binding: sourceBinding,
        runtime_profile: runtimeProfile,
        network_profile: networkProfile,
        access_profile: accessProfile,
        lifecycle_status: spec.state.lifecycleStatus.value,
        archived_at: spec.state.archivedAt?.value ?? null,
        archive_reason: spec.state.archiveReason?.value ?? null,
        deleted_at: spec.state.deletedAt?.value ?? null,
        created_at: spec.state.createdAt.value,
      },
      variables: serializeEnvironmentVariables(spec.state.variables).map((variable) => ({
        id: `${spec.state.id.value}:${variable.key}:${variable.exposure}:${variable.scope}:${variable.index}`,
        resource_id: spec.state.id.value,
        key: variable.key,
        value: variable.value,
        kind: variable.kind,
        exposure: variable.exposure,
        scope: variable.scope,
        is_secret: variable.is_secret,
        updated_at: variable.updated_at,
      })),
    };
  }
}

export class PgResourceRepository implements ResourceRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    resource: Resource,
    spec: ResourceMutationSpec,
  ): Promise<void> {
    void resource;
    const mutation = spec.accept(new KyselyResourceMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("resource", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "resource",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("resources")
            .values(mutation.resource)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                name: mutation.resource.name,
                slug: mutation.resource.slug,
                kind: mutation.resource.kind,
                destination_id: mutation.resource.destination_id ?? null,
                description: mutation.resource.description ?? null,
                services: mutation.resource.services as unknown as Record<string, unknown>[],
                source_binding: mutation.resource.source_binding,
                runtime_profile: mutation.resource.runtime_profile,
                network_profile: mutation.resource.network_profile,
                access_profile: mutation.resource.access_profile,
                lifecycle_status: mutation.resource.lifecycle_status,
                archived_at: mutation.resource.archived_at ?? null,
                archive_reason: mutation.resource.archive_reason ?? null,
                deleted_at: mutation.resource.deleted_at ?? null,
              }),
            )
            .execute();

          await transaction
            .deleteFrom("resource_variables")
            .where("resource_id", "=", mutation.resource.id)
            .execute();

          if (mutation.variables.length > 0) {
            await transaction.insertInto("resource_variables").values(mutation.variables).execute();
          }
        });
      },
    );
  }

  private async loadState(executor: RepositoryExecutor, id: string): Promise<Resource | null> {
    const resourceRow = await executor
      .selectFrom("resources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!resourceRow) {
      return null;
    }

    const variables = await executor
      .selectFrom("resource_variables")
      .selectAll()
      .where("resource_id", "=", resourceRow.id)
      .orderBy("updated_at", "asc")
      .execute();

    return Resource.rehydrate(rehydrateResourceRow(resourceRow, variables));
  }

  async findOne(context: RepositoryContext, spec: ResourceSelectionSpec): Promise<Resource | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("resource", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "resource",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("resources").selectAll(),
            new KyselyResourceSelectionVisitor(),
          )
          .executeTakeFirst();

        if (!row) {
          return null;
        }

        return this.loadState(executor, row.id);
      },
    );
  }
}
