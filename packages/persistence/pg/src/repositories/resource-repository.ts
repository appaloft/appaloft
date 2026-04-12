import {
  createRepositorySpanName,
  type RepositoryContext,
  type ResourceRepository,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  Resource,
  type ResourceByEnvironmentAndSlugSpec,
  type ResourceByIdSpec,
  type ResourceMutationSpec,
  type ResourceMutationSpecVisitor,
  type ResourceSelectionSpec,
  type ResourceSelectionSpecVisitor,
  type UpsertResourceSpec,
} from "@yundu/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  rehydrateResourceRow,
  resolveRepositoryExecutor,
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
          [yunduTraceAttributes.repositoryName]: "resource",
          [yunduTraceAttributes.mutationSpecName]: spec.constructor.name,
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
          [yunduTraceAttributes.repositoryName]: "resource",
          [yunduTraceAttributes.selectionSpecName]: spec.constructor.name,
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
