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
  rehydrateResourceRow,
  resolveRepositoryExecutor,
  type SerializedResourceNetworkProfile,
  type SerializedResourceRuntimeProfile,
  type SerializedResourceSourceBinding,
  serializeHealthCheckPolicy,
  serializeResourceServices,
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
      values: Insertable<Database["resources"]>;
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

    return {
      values: {
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
        lifecycle_status: spec.state.lifecycleStatus.value,
        archived_at: spec.state.archivedAt?.value ?? null,
        archive_reason: spec.state.archiveReason?.value ?? null,
        deleted_at: spec.state.deletedAt?.value ?? null,
        created_at: spec.state.createdAt.value,
      },
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
    const executor = resolveRepositoryExecutor(this.db, context);
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
        await executor
          .insertInto("resources")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              name: mutation.values.name,
              slug: mutation.values.slug,
              kind: mutation.values.kind,
              destination_id: mutation.values.destination_id ?? null,
              description: mutation.values.description ?? null,
              services: mutation.values.services as unknown as Record<string, unknown>[],
              source_binding: mutation.values.source_binding,
              runtime_profile: mutation.values.runtime_profile,
              network_profile: mutation.values.network_profile,
              lifecycle_status: mutation.values.lifecycle_status,
              archived_at: mutation.values.archived_at ?? null,
              archive_reason: mutation.values.archive_reason ?? null,
              deleted_at: mutation.values.deleted_at ?? null,
            }),
          )
          .execute();
      },
    );
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

        return Resource.rehydrate(rehydrateResourceRow(row));
      },
    );
  }
}
