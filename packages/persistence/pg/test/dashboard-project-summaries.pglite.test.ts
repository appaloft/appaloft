import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

describe("Dashboard Project summaries read model", () => {
  test("[DASH-DATA-001][DASH-DATA-005] returns one bounded aggregate query page", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dashboard-projects-"));
    const { createDatabase, createMigrator, PgProjectSummariesReadModel } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();
      const context = toRepositoryContext(
        createExecutionContext({
          entrypoint: "system",
          requestId: "req_dashboard_project_summaries",
          tenant: { tenantId: "org_dashboard", organizationId: "org_dashboard" },
        }),
      );

      await database.db
        .insertInto("projects")
        .values([
          {
            id: "prj_atlas",
            organization_id: "org_dashboard",
            name: "Atlas API",
            slug: "atlas-api",
            description: "API",
            created_at: "2026-08-20T00:00:00.000Z",
          },
          {
            id: "prj_other",
            organization_id: "org_other",
            name: "Other",
            slug: "other",
            description: null,
            created_at: "2026-08-21T00:00:00.000Z",
          },
        ])
        .execute();
      await database.db
        .insertInto("environments")
        .values({
          id: "env_atlas",
          project_id: "prj_atlas",
          name: "Production",
          kind: "production",
          created_at: "2026-08-20T00:00:00.000Z",
        })
        .execute();
      await database.db
        .insertInto("resources")
        .values([
          {
            id: "res_api",
            project_id: "prj_atlas",
            environment_id: "env_atlas",
            name: "api",
            slug: "api",
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
          {
            id: "res_worker",
            project_id: "prj_atlas",
            environment_id: "env_atlas",
            name: "worker",
            slug: "worker",
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
      await database.db
        .insertInto("resource_health_observations")
        .values({
          id: "rho_worker",
          resource_id: "res_worker",
          observed_at: "2026-08-24T09:00:00.000Z",
          overall: "failed",
          runtime_lifecycle: "running",
          runtime_health: "failed",
          public_access_status: "unknown",
          proxy_status: "unknown",
          health_policy_status: "unknown",
          latest_deployment_id: null,
          summary: {},
          retained_until: "2026-09-24T09:00:00.000Z",
          created_at: "2026-08-24T09:00:00.000Z",
        })
        .execute();

      const readModel = new PgProjectSummariesReadModel(database.db);
      const result = await readModel.list(context, {
        limit: 24,
        search: "atlas",
        sort: "recent-activity-desc",
      });

      expect(result).toEqual({
        items: [
          {
            id: "prj_atlas",
            name: "Atlas API",
            slug: "atlas-api",
            description: "API",
            resourceCount: 2,
            attentionCount: 1,
            attentionStatus: "attention",
            latestActivityAt: "2026-08-24T09:00:00.000Z",
          },
        ],
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
