import {
  type DashboardProjectSummary,
  type ProjectSummariesReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
} from "./shared";

interface ProjectSummaryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  resource_count: number | string;
  attention_count: number | string;
  default_environment_id: string | null;
  default_environment_name: string | null;
  default_environment_kind: string | null;
  latest_activity_at: string;
}

function cursorOffset(cursor?: string): number {
  if (!cursor?.startsWith("offset:")) return 0;
  const offset = Number(cursor.slice("offset:".length));
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

export class PgProjectSummariesReadModel implements ProjectSummariesReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: Parameters<ProjectSummariesReadModel["list"]>[1],
  ): Promise<{ items: DashboardProjectSummary[]; nextCursor?: string }> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    const offset = cursorOffset(input.cursor);
    const search = input.search?.trim().toLocaleLowerCase();
    const organizationIds = input.organizationIds?.length ? [...input.organizationIds] : undefined;
    const projectIds = input.projectIds?.length ? [...input.projectIds] : undefined;
    const order =
      input.sort === "name-asc"
        ? sql`p.name asc, p.id asc`
        : input.sort === "name-desc"
          ? sql`p.name desc, p.id asc`
          : sql`latest_activity_at desc, p.id asc`;

    const result = await sql<ProjectSummaryRow>`
      select
        p.id,
        p.name,
        p.slug,
        p.description,
        (
          select e.id
          from environments e
          where e.project_id = p.id and e.lifecycle_status = 'active'
          order by case when e.kind = 'production' then 0 else 1 end, e.created_at asc, e.id asc
          limit 1
        ) as default_environment_id,
        (
          select e.name
          from environments e
          where e.project_id = p.id and e.lifecycle_status = 'active'
          order by case when e.kind = 'production' then 0 else 1 end, e.created_at asc, e.id asc
          limit 1
        ) as default_environment_name,
        (
          select e.kind
          from environments e
          where e.project_id = p.id and e.lifecycle_status = 'active'
          order by case when e.kind = 'production' then 0 else 1 end, e.created_at asc, e.id asc
          limit 1
        ) as default_environment_kind,
        (
          select count(*)
          from resources r
          where r.project_id = p.id
            and r.lifecycle_status = 'active'
            and r.deleted_at is null
        ) as resource_count,
        (
          select count(*)
          from resources r
          where r.project_id = p.id
            and r.lifecycle_status = 'active'
            and r.deleted_at is null
            and coalesce((
              select rho.overall
              from resource_health_observations rho
              where rho.resource_id = r.id
              order by rho.observed_at desc, rho.id desc
              limit 1
            ), 'unknown') in ('degraded', 'failed', 'unreachable')
        ) as attention_count,
        greatest(
          p.created_at,
          coalesce((select max(d.created_at) from deployments d where d.project_id = p.id), p.created_at),
          coalesce((
            select max(rho.observed_at)
            from resource_health_observations rho
            join resources r on r.id = rho.resource_id
            where r.project_id = p.id
          ), p.created_at)
        ) as latest_activity_at
      from projects p
      where p.lifecycle_status = 'active'
        and p.deleted_at is null
        ${organizationId ? sql`and p.organization_id = ${organizationId}` : sql``}
        ${organizationIds ? sql`and p.organization_id in (${sql.join(organizationIds)})` : sql``}
        ${projectIds ? sql`and p.id in (${sql.join(projectIds)})` : sql``}
        ${search ? sql`and (lower(p.name) like ${`%${search}%`} or lower(p.slug) like ${`%${search}%`})` : sql``}
      order by ${order}
      limit ${input.limit + 1}
      offset ${offset}
    `.execute(executor);

    const hasNextPage = result.rows.length > input.limit;
    const rows = result.rows.slice(0, input.limit);
    return {
      items: rows.map((row) => {
        const attentionCount = Number(row.attention_count);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          ...(row.description ? { description: row.description } : {}),
          resourceCount: Number(row.resource_count),
          attentionCount,
          attentionStatus: attentionCount > 0 ? "attention" : "healthy",
          ...(row.default_environment_id &&
          row.default_environment_name &&
          row.default_environment_kind
            ? {
                defaultEnvironment: {
                  id: row.default_environment_id,
                  name: row.default_environment_name,
                  kind: row.default_environment_kind as NonNullable<
                    DashboardProjectSummary["defaultEnvironment"]
                  >["kind"],
                },
              }
            : {}),
          latestActivityAt: normalizeTimestamp(row.latest_activity_at) ?? row.latest_activity_at,
        };
      }),
      ...(hasNextPage ? { nextCursor: `offset:${offset + input.limit}` } : {}),
    };
  }
}
