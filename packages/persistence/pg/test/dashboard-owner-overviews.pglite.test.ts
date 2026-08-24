import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src/schema";

async function seed(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("projects")
    .values([
      {
        id: "prj_atlas",
        organization_id: "org_dashboard",
        name: "Atlas API",
        slug: "atlas-api",
        description: "Public API",
        created_at: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "prj_other",
        organization_id: "org_other",
        name: "Other",
        slug: "other",
        description: null,
        created_at: "2026-08-20T00:00:00.000Z",
      },
    ])
    .execute();
  await db
    .insertInto("environments")
    .values([
      {
        id: "env_production",
        project_id: "prj_atlas",
        name: "Production",
        kind: "production",
        created_at: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "env_staging",
        project_id: "prj_atlas",
        name: "Staging",
        kind: "staging",
        created_at: "2026-08-21T00:00:00.000Z",
      },
      {
        id: "env_other",
        project_id: "prj_other",
        name: "Production",
        kind: "production",
        created_at: "2026-08-20T00:00:00.000Z",
      },
    ])
    .execute();
  await db
    .insertInto("resources")
    .values([
      {
        id: "res_api",
        project_id: "prj_atlas",
        environment_id: "env_production",
        destination_id: null,
        name: "api",
        slug: "api",
        kind: "application",
        description: "HTTP API",
        services: [{ name: "api", kind: "web" }],
        source_binding: { kind: "git", locator: "https://example.test/atlas.git" },
        runtime_profile: { strategy: "dockerfile" },
        network_profile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
        access_profile: { generatedAccessMode: "inherit", pathPrefix: "/" },
        lifecycle_status: "active",
        archived_at: null,
        archive_reason: null,
        deleted_at: null,
        created_at: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "res_other",
        project_id: "prj_other",
        environment_id: "env_other",
        destination_id: null,
        name: "other",
        slug: "other",
        kind: "application",
        description: null,
        services: [],
        source_binding: null,
        runtime_profile: null,
        network_profile: null,
        access_profile: null,
        lifecycle_status: "active",
        archived_at: null,
        archive_reason: null,
        deleted_at: null,
        created_at: "2026-08-20T00:00:00.000Z",
      },
    ])
    .execute();
  await db
    .insertInto("deployments")
    .values({
      id: "dep_api",
      project_id: "prj_atlas",
      environment_id: "env_production",
      resource_id: "res_api",
      target_kind: "serverless-static-artifact",
      server_id: null,
      destination_id: null,
      static_artifact_publication_id: "pub_api",
      static_artifact_id: "art_api",
      static_artifact_route_url: "https://api.example.test",
      status: "succeeded",
      runtime_plan: { execution: { kind: "static-artifact" } },
      environment_snapshot: {},
      timeline: [],
      created_at: "2026-08-24T07:59:00.000Z",
      started_at: "2026-08-24T07:58:00.000Z",
      finished_at: "2026-08-24T07:59:00.000Z",
      rollback_of_deployment_id: null,
    })
    .execute();
  await db
    .insertInto("resource_health_observations")
    .values({
      id: "rho_api",
      resource_id: "res_api",
      observed_at: "2026-08-24T08:00:00.000Z",
      overall: "healthy",
      runtime_lifecycle: "running",
      runtime_health: "healthy",
      public_access_status: "ready",
      proxy_status: "ready",
      health_policy_status: "healthy",
      latest_deployment_id: "dep_api",
      summary: {},
      retained_until: "2026-09-24T08:00:00.000Z",
      created_at: "2026-08-24T08:00:00.000Z",
    })
    .execute();
}

describe("Dashboard owner overview read models", () => {
  test("[DASH-DATA-002][DASH-DATA-005] returns a bounded Project Environment page without fan-out", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dashboard-project-environment-"));
    const { createDatabase, createMigrator, PgProjectEnvironmentOverviewReadModel } =
      await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      await seed(database.db);
      const context = toRepositoryContext(
        createExecutionContext({
          entrypoint: "system",
          requestId: "req_dashboard_project_environment",
          tenant: { tenantId: "org_dashboard", organizationId: "org_dashboard" },
        }),
      );

      const result = await new PgProjectEnvironmentOverviewReadModel(database.db).show(context, {
        projectId: "prj_atlas",
        environmentId: "env_production",
        limit: 50,
        sort: "name-asc",
        health: "all",
      });

      expect(result).toMatchObject({
        schemaVersion: "project-environments.overview/v1",
        project: { id: "prj_atlas", name: "Atlas API", slug: "atlas-api" },
        environment: { id: "env_production", name: "Production", kind: "production" },
        environmentChoices: [
          { id: "env_production", name: "Production" },
          { id: "env_staging", name: "Staging" },
        ],
        resources: [
          {
            id: "res_api",
            health: { status: "healthy", observedAt: "2026-08-24T08:00:00.000Z" },
            access: { status: "ready", url: "https://api.example.test" },
            latestDeployment: { id: "dep_api", status: "succeeded" },
            attentionStatus: "healthy",
          },
        ],
        attention: { total: 1, healthy: 1, attention: 0, unknown: 0 },
      });
      expect(result?.resources[0]).not.toHaveProperty("deployments");
      expect(
        await new PgProjectEnvironmentOverviewReadModel(database.db).show(context, {
          projectId: "prj_other",
          environmentId: "env_other",
          limit: 50,
          sort: "name-asc",
          health: "all",
        }),
      ).toBeNull();
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[DASH-DATA-003][DASH-DATA-006] validates owner consistency and caps deployment context", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dashboard-resource-overview-"));
    const { createDatabase, createMigrator, PgResourceOverviewReadModel } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      await seed(database.db);
      const context = toRepositoryContext(
        createExecutionContext({
          entrypoint: "system",
          requestId: "req_dashboard_resource_overview",
          tenant: { tenantId: "org_dashboard", organizationId: "org_dashboard" },
        }),
      );

      const result = await new PgResourceOverviewReadModel(database.db).show(context, {
        projectId: "prj_atlas",
        environmentId: "env_production",
        resourceId: "res_api",
      });

      expect(result).toMatchObject({
        schemaVersion: "resources.overview/v1",
        resource: {
          id: "res_api",
          projectId: "prj_atlas",
          environmentId: "env_production",
          name: "api",
        },
        health: { status: "healthy" },
        access: { status: "ready", url: "https://api.example.test" },
        configuration: { status: "ready" },
        network: { internalPort: 3000, protocol: "http", exposureMode: "reverse-proxy" },
        capabilities: {
          deploy: true,
          configure: true,
          logs: true,
          metrics: true,
          networking: true,
        },
        latestDeployments: [{ id: "dep_api", status: "succeeded" }],
      });
      expect(result?.latestDeployments.length).toBeLessThanOrEqual(5);
      expect(
        await new PgResourceOverviewReadModel(database.db).show(context, {
          projectId: "prj_atlas",
          environmentId: "env_staging",
          resourceId: "res_api",
        }),
      ).toBeNull();
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
