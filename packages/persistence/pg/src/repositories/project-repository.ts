import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type ProjectRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  Project,
  type ProjectByIdSpec,
  type ProjectBySlugSpec,
  type ProjectMutationSpec,
  type ProjectMutationSpecVisitor,
  type ProjectSelectionSpec,
  type ProjectSelectionSpecVisitor,
  type UpsertProjectSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { rehydrateProject, resolveRepositoryExecutor } from "./shared";

type ProjectSelectionQuery = SelectQueryBuilder<
  Database,
  "projects",
  Selectable<Database["projects"]>
>;

class KyselyProjectSelectionVisitor implements ProjectSelectionSpecVisitor<ProjectSelectionQuery> {
  visitProjectById(query: ProjectSelectionQuery, spec: ProjectByIdSpec): ProjectSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitProjectBySlug(query: ProjectSelectionQuery, spec: ProjectBySlugSpec): ProjectSelectionQuery {
    return query.where("slug", "=", spec.slug.value);
  }
}

class KyselyProjectMutationVisitor
  implements ProjectMutationSpecVisitor<{ values: Insertable<Database["projects"]> }>
{
  visitUpsertProject(spec: UpsertProjectSpec) {
    return {
      values: {
        id: spec.state.id.value,
        name: spec.state.name.value,
        slug: spec.state.slug.value,
        description: spec.state.description?.value ?? null,
        created_at: spec.state.createdAt.value,
      },
    };
  }
}

export class PgProjectRepository implements ProjectRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    project: Project,
    spec: ProjectMutationSpec,
  ): Promise<void> {
    void project;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyProjectMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("project", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "project",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("projects")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              name: mutation.values.name,
              slug: mutation.values.slug,
              description: mutation.values.description,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<Project | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("project", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "project",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(executor.selectFrom("projects").selectAll(), new KyselyProjectSelectionVisitor())
          .executeTakeFirst();

        return row ? Project.rehydrate(rehydrateProject(row)) : null;
      },
    );
  }
}
