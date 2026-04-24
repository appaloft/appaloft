import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type ProjectReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import {
  type ProjectByIdSpec,
  type ProjectBySlugSpec,
  type ProjectSelectionSpecVisitor,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

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

function toProjectSummary(
  row: Selectable<Database["projects"]>,
): Awaited<ReturnType<ProjectReadModel["list"]>>[number] {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    lifecycleStatus: row.lifecycle_status as "active" | "archived",
    ...(row.archived_at
      ? { archivedAt: normalizeTimestamp(row.archived_at) ?? row.archived_at }
      : {}),
    ...(row.archive_reason ? { archiveReason: row.archive_reason } : {}),
    ...(row.description ? { description: row.description } : {}),
  };
}

export class PgProjectReadModel implements ProjectReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(context: RepositoryContext) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("project", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "project",
        },
      },
      async () =>
        executor
          .selectFrom("projects")
          .selectAll()
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) => rows.map(toProjectSummary)),
    );
  }

  async findOne(context: RepositoryContext, spec: Parameters<ProjectReadModel["findOne"]>[1]) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("project", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "project",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(executor.selectFrom("projects").selectAll(), new KyselyProjectSelectionVisitor())
          .executeTakeFirst();

        return row ? toProjectSummary(row) : null;
      },
    );
  }
}
