import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type ProjectOwnershipReadModel,
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
import {
  defaultReadModelListLimit,
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
} from "./shared";

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
    organizationId: row.organization_id,
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

export class PgProjectReadModel implements ProjectReadModel, ProjectOwnershipReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async count(
    context: RepositoryContext,
    input?: {
      organizationId?: string;
      organizationIds?: readonly string[];
      projectIds?: readonly string[];
    },
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("project", "count"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "project",
        },
      },
      async () => {
        const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("projects")
          .select((expressionBuilder) => [expressionBuilder.fn.count<number>("id").as("count")])
          .where("lifecycle_status", "!=", "deleted");
        if (contextOrganizationId) {
          query = query.where("organization_id", "=", contextOrganizationId);
        }
        if (input?.organizationId) {
          query = query.where("organization_id", "=", input.organizationId);
        }
        if (input?.organizationIds?.length) {
          query = query.where("organization_id", "in", [...input.organizationIds]);
        }
        if (input?.projectIds?.length) {
          query = query.where("id", "in", [...input.projectIds]);
        }

        const row = await query.executeTakeFirst();
        return Number(row?.count ?? 0);
      },
    );
  }

  async list(
    context: RepositoryContext,
    input?: {
      organizationId?: string;
      organizationIds?: readonly string[];
      projectIds?: readonly string[];
      limit?: number;
    },
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("project", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "project",
        },
      },
      async () => {
        const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("projects")
          .selectAll()
          .where("lifecycle_status", "!=", "deleted");
        if (contextOrganizationId) {
          query = query.where("organization_id", "=", contextOrganizationId);
        }
        if (input?.organizationId) {
          query = query.where("organization_id", "=", input.organizationId);
        }
        if (input?.organizationIds?.length) {
          query = query.where("organization_id", "in", [...input.organizationIds]);
        }
        if (input?.projectIds?.length) {
          query = query.where("id", "in", [...input.projectIds]);
        }
        query = query.limit(input?.limit ?? defaultReadModelListLimit);

        return query
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) => rows.map(toProjectSummary));
      },
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
        const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
        let query = spec
          .accept(executor.selectFrom("projects").selectAll(), new KyselyProjectSelectionVisitor())
          .where("lifecycle_status", "!=", "deleted");
        if (contextOrganizationId) {
          query = query.where("organization_id", "=", contextOrganizationId);
        }
        const row = await query.executeTakeFirst();

        return row ? toProjectSummary(row) : null;
      },
    );
  }

  async findProjectOrganization(context: RepositoryContext, input: { projectId: string }) {
    const executor = resolveRepositoryExecutor(this.db, context);
    const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
    let query = executor
      .selectFrom("projects")
      .select(["id", "organization_id"])
      .where("id", "=", input.projectId);
    if (contextOrganizationId) {
      query = query.where("organization_id", "=", contextOrganizationId);
    }
    const row = await query.executeTakeFirst();

    return row ? { projectId: row.id, organizationId: row.organization_id } : null;
  }
}
