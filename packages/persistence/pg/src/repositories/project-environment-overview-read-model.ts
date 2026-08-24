import {
  type ProjectEnvironmentOverview,
  type ProjectEnvironmentOverviewReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
} from "./shared";

interface OwnerRow {
  project_id: string;
  project_name: string;
  project_slug: string;
  project_description: string | null;
  environment_id: string;
  environment_name: string;
  environment_kind: string;
  environment_lifecycle_status: string;
}

interface EnvironmentChoiceRow {
  id: string;
  name: string;
  kind: string;
  lifecycle_status: string;
}

interface ResourceSummaryRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  health_status: string;
  health_observed_at: string | null;
  deployment_id: string | null;
  deployment_status: string | null;
  deployment_created_at: string | null;
  deployment_started_at: string | null;
  deployment_finished_at: string | null;
  static_route_url: string | null;
  domain_name: string | null;
  domain_path_prefix: string | null;
  domain_tls_mode: string | null;
  domain_status: string | null;
  attention_status: "healthy" | "attention" | "unknown";
  total_count: number | string;
  healthy_count: number | string;
  attention_count: number | string;
  unknown_count: number | string;
}

function cursorOffset(cursor?: string): number {
  if (!cursor?.startsWith("offset:")) return 0;
  const offset = Number(cursor.slice("offset:".length));
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

function accessUrl(row: ResourceSummaryRow): string | undefined {
  if (row.static_route_url) return row.static_route_url;
  if (!row.domain_name || row.domain_status !== "active") return undefined;
  const protocol = row.domain_tls_mode === "disabled" ? "http" : "https";
  const path =
    row.domain_path_prefix && row.domain_path_prefix !== "/" ? row.domain_path_prefix : "";
  return `${protocol}://${row.domain_name}${path}`;
}

export class PgProjectEnvironmentOverviewReadModel implements ProjectEnvironmentOverviewReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async show(
    context: RepositoryContext,
    input: Parameters<ProjectEnvironmentOverviewReadModel["show"]>[1],
  ): Promise<ProjectEnvironmentOverview | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    const organizationIds = input.organizationIds?.length ? [...input.organizationIds] : undefined;
    const projectIds = input.projectIds?.length ? [...input.projectIds] : undefined;

    const owner = await sql<OwnerRow>`
      select
        p.id as project_id,
        p.name as project_name,
        p.slug as project_slug,
        p.description as project_description,
        e.id as environment_id,
        e.name as environment_name,
        e.kind as environment_kind,
        e.lifecycle_status as environment_lifecycle_status
      from projects p
      join environments e on e.project_id = p.id
      where p.id = ${input.projectId}
        and e.id = ${input.environmentId}
        and p.lifecycle_status = 'active'
        and p.deleted_at is null
        and e.lifecycle_status in ('active', 'archived')
        ${organizationId ? sql`and p.organization_id = ${organizationId}` : sql``}
        ${organizationIds ? sql`and p.organization_id in (${sql.join(organizationIds)})` : sql``}
        ${projectIds ? sql`and p.id in (${sql.join(projectIds)})` : sql``}
      limit 1
    `.execute(executor);
    const ownerRow = owner.rows[0];
    if (!ownerRow) return null;

    const choices = await sql<EnvironmentChoiceRow>`
      select id, name, kind, lifecycle_status
      from environments
      where project_id = ${ownerRow.project_id}
        and lifecycle_status in ('active', 'archived')
      order by created_at asc, id asc
      limit 100
    `.execute(executor);

    const offset = cursorOffset(input.cursor);
    const search = input.search?.trim().toLocaleLowerCase();
    const health = input.health ?? "all";
    const order =
      input.sort === "name-desc"
        ? sql`name desc, id asc`
        : input.sort === "recent-activity-desc"
          ? sql`latest_activity_at desc, id asc`
          : sql`name asc, id asc`;

    const result = await sql<ResourceSummaryRow>`
      with resource_rows as (
        select
          r.id,
          r.name,
          r.slug,
          r.kind,
          r.description,
          coalesce(h.overall, 'unknown') as health_status,
          h.observed_at as health_observed_at,
          d.id as deployment_id,
          d.status as deployment_status,
          d.created_at as deployment_created_at,
          d.started_at as deployment_started_at,
          d.finished_at as deployment_finished_at,
          d.static_artifact_route_url as static_route_url,
          b.domain_name,
          b.path_prefix as domain_path_prefix,
          b.tls_mode as domain_tls_mode,
          b.status as domain_status,
          greatest(r.created_at, coalesce(h.observed_at, r.created_at), coalesce(d.created_at, r.created_at)) as latest_activity_at,
          case
            when coalesce(h.overall, 'unknown') in ('degraded', 'failed', 'unreachable')
              or coalesce(d.status, '') in ('failed', 'canceled', 'interrupted') then 'attention'
            when h.overall = 'healthy' then 'healthy'
            else 'unknown'
          end as attention_status
        from resources r
        left join lateral (
          select overall, observed_at
          from resource_health_observations
          where resource_id = r.id
          order by observed_at desc, id desc
          limit 1
        ) h on true
        left join lateral (
          select id, status, created_at, started_at, finished_at, static_artifact_route_url
          from deployments
          where resource_id = r.id
            and project_id = ${ownerRow.project_id}
            and environment_id = ${ownerRow.environment_id}
            and archived_at is null
          order by created_at desc, id desc
          limit 1
        ) d on true
        left join lateral (
          select domain_name, path_prefix, tls_mode, status
          from domain_bindings
          where resource_id = r.id
            and project_id = ${ownerRow.project_id}
            and environment_id = ${ownerRow.environment_id}
          order by case when status = 'active' then 0 else 1 end, created_at desc, id desc
          limit 1
        ) b on true
        where r.project_id = ${ownerRow.project_id}
          and r.environment_id = ${ownerRow.environment_id}
          and r.lifecycle_status = 'active'
          and r.deleted_at is null
          ${search ? sql`and (lower(r.name) like ${`%${search}%`} or lower(r.slug) like ${`%${search}%`})` : sql``}
      ), filtered_rows as (
        select *
        from resource_rows
        where ${health === "all" ? sql`true` : sql`attention_status = ${health}`}
      )
      select
        *,
        count(*) over() as total_count,
        count(*) filter (where attention_status = 'healthy') over() as healthy_count,
        count(*) filter (where attention_status = 'attention') over() as attention_count,
        count(*) filter (where attention_status = 'unknown') over() as unknown_count
      from filtered_rows
      order by ${order}
      limit ${input.limit + 1}
      offset ${offset}
    `.execute(executor);

    const hasNextPage = result.rows.length > input.limit;
    const rows = result.rows.slice(0, input.limit);
    const counts = result.rows[0];

    return {
      schemaVersion: "project-environments.overview/v1",
      project: {
        id: ownerRow.project_id,
        name: ownerRow.project_name,
        slug: ownerRow.project_slug,
        ...(ownerRow.project_description ? { description: ownerRow.project_description } : {}),
      },
      environment: {
        id: ownerRow.environment_id,
        name: ownerRow.environment_name,
        kind: ownerRow.environment_kind as ProjectEnvironmentOverview["environment"]["kind"],
        lifecycleStatus:
          ownerRow.environment_lifecycle_status as ProjectEnvironmentOverview["environment"]["lifecycleStatus"],
      },
      environmentChoices: choices.rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind as ProjectEnvironmentOverview["environment"]["kind"],
        lifecycleStatus:
          row.lifecycle_status as ProjectEnvironmentOverview["environment"]["lifecycleStatus"],
      })),
      resources: rows.map((row) => {
        const url = accessUrl(row);
        const observedAt = normalizeTimestamp(row.health_observed_at);
        const createdAt = normalizeTimestamp(row.deployment_created_at);
        const startedAt = normalizeTimestamp(row.deployment_started_at);
        const finishedAt = normalizeTimestamp(row.deployment_finished_at);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          kind: row.kind as ProjectEnvironmentOverview["resources"][number]["kind"],
          ...(row.description ? { description: row.description } : {}),
          health: {
            status:
              row.health_status as ProjectEnvironmentOverview["resources"][number]["health"]["status"],
            ...(observedAt ? { observedAt } : {}),
          },
          access: url ? { status: "ready" as const, url } : { status: "unknown" as const },
          ...(row.deployment_id && row.deployment_status && createdAt
            ? {
                latestDeployment: {
                  id: row.deployment_id,
                  status: row.deployment_status as NonNullable<
                    ProjectEnvironmentOverview["resources"][number]["latestDeployment"]
                  >["status"],
                  createdAt,
                  ...(startedAt ? { startedAt } : {}),
                  ...(finishedAt ? { finishedAt } : {}),
                },
              }
            : {}),
          attentionStatus: row.attention_status,
        };
      }),
      attention: {
        total: Number(counts?.total_count ?? 0),
        healthy: Number(counts?.healthy_count ?? 0),
        attention: Number(counts?.attention_count ?? 0),
        unknown: Number(counts?.unknown_count ?? 0),
      },
      ...(hasNextPage ? { nextCursor: `offset:${offset + input.limit}` } : {}),
      generatedAt: new Date().toISOString(),
    };
  }
}
