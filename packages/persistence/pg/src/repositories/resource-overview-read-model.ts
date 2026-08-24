import {
  type RepositoryContext,
  type ResourceOverview,
  type ResourceOverviewReadModel,
} from "@appaloft/application";
import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
} from "./shared";

interface ResourceOverviewRow {
  id: string;
  project_id: string;
  environment_id: string;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  lifecycle_status: string;
  source_binding: Record<string, unknown> | null;
  runtime_profile: Record<string, unknown> | null;
  network_profile: Record<string, unknown> | null;
  access_profile: Record<string, unknown> | null;
  health_status: string;
  health_observed_at: string | null;
  static_route_url: string | null;
  domain_name: string | null;
  domain_path_prefix: string | null;
  domain_tls_mode: string | null;
  domain_status: string | null;
}

interface DeploymentRow {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function accessUrl(row: ResourceOverviewRow): string | undefined {
  if (row.static_route_url) return row.static_route_url;
  if (!row.domain_name || row.domain_status !== "active") return undefined;
  const protocol = row.domain_tls_mode === "disabled" ? "http" : "https";
  const path =
    row.domain_path_prefix && row.domain_path_prefix !== "/" ? row.domain_path_prefix : "";
  return `${protocol}://${row.domain_name}${path}`;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class PgResourceOverviewReadModel implements ResourceOverviewReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async show(
    context: RepositoryContext,
    input: Parameters<ResourceOverviewReadModel["show"]>[1],
  ): Promise<ResourceOverview | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const organizationId = resolveRepositoryContextOrganizationId(context);
    const organizationIds = input.organizationIds?.length ? [...input.organizationIds] : undefined;
    const projectIds = input.projectIds?.length ? [...input.projectIds] : undefined;
    const resourceIds = input.resourceIds?.length ? [...input.resourceIds] : undefined;

    const result = await sql<ResourceOverviewRow>`
      select
        r.id,
        r.project_id,
        r.environment_id,
        r.name,
        r.slug,
        r.kind,
        r.description,
        r.lifecycle_status,
        r.source_binding,
        r.runtime_profile,
        r.network_profile,
        r.access_profile,
        coalesce(h.overall, 'unknown') as health_status,
        h.observed_at as health_observed_at,
        d.static_artifact_route_url as static_route_url,
        b.domain_name,
        b.path_prefix as domain_path_prefix,
        b.tls_mode as domain_tls_mode,
        b.status as domain_status
      from resources r
      join projects p on p.id = r.project_id
      join environments e on e.id = r.environment_id and e.project_id = r.project_id
      left join lateral (
        select overall, observed_at
        from resource_health_observations
        where resource_id = r.id
        order by observed_at desc, id desc
        limit 1
      ) h on true
      left join lateral (
        select static_artifact_route_url
        from deployments
        where resource_id = r.id
          and project_id = r.project_id
          and environment_id = r.environment_id
          and archived_at is null
        order by created_at desc, id desc
        limit 1
      ) d on true
      left join lateral (
        select domain_name, path_prefix, tls_mode, status
        from domain_bindings
        where resource_id = r.id
          and project_id = r.project_id
          and environment_id = r.environment_id
        order by case when status = 'active' then 0 else 1 end, created_at desc, id desc
        limit 1
      ) b on true
      where r.id = ${input.resourceId}
        and r.project_id = ${input.projectId}
        and r.environment_id = ${input.environmentId}
        and r.lifecycle_status in ('active', 'archived')
        and r.deleted_at is null
        and p.lifecycle_status = 'active'
        and p.deleted_at is null
        and e.lifecycle_status in ('active', 'archived')
        ${organizationId ? sql`and p.organization_id = ${organizationId}` : sql``}
        ${organizationIds ? sql`and p.organization_id in (${sql.join(organizationIds)})` : sql``}
        ${projectIds ? sql`and p.id in (${sql.join(projectIds)})` : sql``}
        ${resourceIds ? sql`and r.id in (${sql.join(resourceIds)})` : sql``}
      limit 1
    `.execute(executor);
    const row = result.rows[0];
    if (!row) return null;

    const deployments = await sql<DeploymentRow>`
      select id, status, created_at, started_at, finished_at
      from deployments
      where resource_id = ${row.id}
        and project_id = ${row.project_id}
        and environment_id = ${row.environment_id}
        and archived_at is null
      order by created_at desc, id desc
      limit 5
    `.execute(executor);

    const network = row.network_profile ?? {};
    const url = accessUrl(row);
    const observedAt = normalizeTimestamp(row.health_observed_at);
    const sourceConfigured = row.source_binding !== null;
    const runtimeConfigured = row.runtime_profile !== null;
    const executable = !["static-site", "external"].includes(row.kind);
    const internalPort = numericValue(network.internalPort);
    const protocol = stringValue(network.upstreamProtocol);
    const exposureMode = stringValue(network.exposureMode);

    return {
      schemaVersion: "resources.overview/v1",
      resource: {
        id: row.id,
        projectId: row.project_id,
        environmentId: row.environment_id,
        name: row.name,
        slug: row.slug,
        kind: row.kind as ResourceOverview["resource"]["kind"],
        ...(row.description ? { description: row.description } : {}),
        lifecycleStatus:
          row.lifecycle_status === "archived" ? ("archived" as const) : ("active" as const),
      },
      health: {
        status: row.health_status as ResourceOverview["health"]["status"],
        ...(observedAt ? { observedAt } : {}),
      },
      access: url ? { status: "ready", url } : { status: "unknown" },
      configuration: {
        sourceConfigured,
        runtimeConfigured,
        networkConfigured: row.network_profile !== null,
        accessConfigured: row.access_profile !== null,
        status: sourceConfigured && runtimeConfigured ? "ready" : "incomplete",
      },
      network: {
        ...(internalPort !== undefined ? { internalPort } : {}),
        ...(protocol
          ? {
              protocol: protocol as NonNullable<ResourceOverview["network"]["protocol"]>,
            }
          : {}),
        ...(exposureMode
          ? {
              exposureMode: exposureMode as NonNullable<
                ResourceOverview["network"]["exposureMode"]
              >,
            }
          : {}),
      },
      capabilities: {
        deploy: true,
        configure: true,
        logs: executable,
        metrics: executable,
        networking: true,
      },
      latestDeployments: deployments.rows.map((deployment) => {
        const startedAt = normalizeTimestamp(deployment.started_at);
        const finishedAt = normalizeTimestamp(deployment.finished_at);
        return {
          id: deployment.id,
          status: deployment.status as ResourceOverview["latestDeployments"][number]["status"],
          createdAt: normalizeTimestamp(deployment.created_at) ?? deployment.created_at,
          ...(startedAt ? { startedAt } : {}),
          ...(finishedAt ? { finishedAt } : {}),
        };
      }),
      generatedAt: new Date().toISOString(),
    };
  }
}
