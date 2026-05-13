import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

async function seedBaseRows(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("projects")
    .values({
      id: "prj_demo",
      name: "Demo",
      slug: "demo",
      description: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("servers")
    .values([
      {
        id: "srv_primary",
        name: "Primary",
        host: "203.0.113.10",
        port: 22,
        provider_key: "generic-ssh",
        edge_proxy_kind: null,
        edge_proxy_status: null,
        edge_proxy_last_attempt_at: null,
        edge_proxy_last_succeeded_at: null,
        edge_proxy_last_error_code: null,
        edge_proxy_last_error_message: null,
        credential_id: null,
        credential_kind: null,
        credential_username: null,
        credential_public_key: null,
        credential_private_key: null,
        lifecycle_status: "active",
        deactivated_at: null,
        deactivation_reason: null,
        deleted_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "srv_secondary",
        name: "Secondary",
        host: "203.0.113.11",
        port: 22,
        provider_key: "generic-ssh",
        edge_proxy_kind: null,
        edge_proxy_status: null,
        edge_proxy_last_attempt_at: null,
        edge_proxy_last_succeeded_at: null,
        edge_proxy_last_error_code: null,
        edge_proxy_last_error_message: null,
        credential_id: null,
        credential_kind: null,
        credential_username: null,
        credential_public_key: null,
        credential_private_key: null,
        lifecycle_status: "active",
        deactivated_at: null,
        deactivation_reason: null,
        deleted_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();
  await db
    .insertInto("destinations")
    .values({
      id: "dst_demo",
      server_id: "srv_primary",
      name: "Primary destination",
      kind: "single-server",
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("environments")
    .values({
      id: "env_demo",
      project_id: "prj_demo",
      name: "Production",
      kind: "production",
      parent_environment_id: null,
      lifecycle_status: "active",
      locked_at: null,
      lock_reason: null,
      archived_at: null,
      archive_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("resources")
    .values([
      {
        id: "res_web",
        project_id: "prj_demo",
        environment_id: "env_demo",
        destination_id: "dst_demo",
        name: "Web",
        slug: "web",
        kind: "web-service",
        description: null,
        services: [],
        source_binding: null,
        runtime_profile: null,
        network_profile: null,
        access_profile: null,
        auto_deploy_policy: null,
        lifecycle_status: "active",
        archived_at: null,
        archive_reason: null,
        deleted_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "res_api",
        project_id: "prj_demo",
        environment_id: "env_demo",
        destination_id: "dst_demo",
        name: "API",
        slug: "api",
        kind: "web-service",
        description: null,
        services: [],
        source_binding: null,
        runtime_profile: null,
        network_profile: null,
        access_profile: null,
        auto_deploy_policy: null,
        lifecycle_status: "active",
        archived_at: null,
        archive_reason: null,
        deleted_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();
}

async function seedDeployment(
  db: Kysely<Database>,
  input: {
    id: string;
    resourceId: string;
    serverId: string;
    logs?: Record<string, unknown>[];
  },
): Promise<void> {
  await db
    .insertInto("deployments")
    .values({
      id: input.id,
      project_id: "prj_demo",
      environment_id: "env_demo",
      resource_id: input.resourceId,
      server_id: input.serverId,
      destination_id: "dst_demo",
      status: "succeeded",
      runtime_plan: {
        id: `rplan_${input.id}`,
        source: {
          kind: "local-folder",
          locator: ".",
          displayName: "workspace",
        },
        buildStrategy: "workspace-commands",
        packagingMode: "host-process-runtime",
        execution: {
          kind: "docker-container",
        },
        target: {
          kind: "single-server",
          providerKey: "generic-ssh",
          serverIds: [input.serverId],
        },
        detectSummary: "detected workspace",
        generatedAt: "2026-01-01T00:00:00.000Z",
        steps: ["start process"],
      },
      environment_snapshot: {
        id: `snap_${input.id}`,
        environmentId: "env_demo",
        createdAt: "2026-01-01T00:00:00.000Z",
        precedence: ["environment", "deployment"],
        variables: [],
      },
      dependency_binding_references: [],
      logs: input.logs ?? [],
      created_at: "2026-01-01T00:00:00.000Z",
      started_at: "2026-01-01T00:00:01.000Z",
      finished_at: "2026-01-01T00:00:04.000Z",
      trigger_kind: "manual",
      source_deployment_id: null,
      rollback_candidate_deployment_id: null,
      rollback_of_deployment_id: null,
      supersedes_deployment_id: null,
      superseded_by_deployment_id: null,
    })
    .execute();
}

describe("provider job log retention persistence", () => {
  test("[PROV-JOB-LOG-PRUNE-002][PROV-JOB-LOG-PRUNE-003] prunes only old matching provider job logs", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-provider-job-log-retention-"));
    const { createDatabase, createMigrator, PgProviderJobLogRetentionStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedBaseRows(database.db);
      await seedDeployment(database.db, {
        id: "dep_web",
        resourceId: "res_web",
        serverId: "srv_primary",
        logs: [
          {
            level: "info",
            message: "deployment log retained",
          },
        ],
      });
      await seedDeployment(database.db, {
        id: "dep_api",
        resourceId: "res_api",
        serverId: "srv_secondary",
      });
      await database.db
        .insertInto("provider_job_logs")
        .values([
          {
            id: "pjl_match",
            deployment_id: "dep_web",
            provider_key: "generic-ssh",
            payload: { safe: "old" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "pjl_cutoff_equal",
            deployment_id: "dep_web",
            provider_key: "generic-ssh",
            payload: { safe: "cutoff" },
            created_at: "2026-01-01T00:05:00.000Z",
          },
          {
            id: "pjl_newer",
            deployment_id: "dep_web",
            provider_key: "generic-ssh",
            payload: { safe: "newer" },
            created_at: "2026-01-01T00:06:00.000Z",
          },
          {
            id: "pjl_other_provider",
            deployment_id: "dep_web",
            provider_key: "local-shell",
            payload: { safe: "provider" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "pjl_other_resource",
            deployment_id: "dep_api",
            provider_key: "generic-ssh",
            payload: { safe: "resource" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_provider_job_log_retention_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgProviderJobLogRetentionStore(database.db);

      const dryRun = await store.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        providerKey: "generic-ssh",
        resourceId: "res_web",
        dryRun: true,
      });
      const afterDryRunRows = await database.db
        .selectFrom("provider_job_logs")
        .select("id")
        .orderBy("id")
        .execute();
      const destructive = await store.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        providerKey: "generic-ssh",
        resourceId: "res_web",
        dryRun: false,
      });
      const remainingProviderLogs = await database.db
        .selectFrom("provider_job_logs")
        .select("id")
        .orderBy("id")
        .execute();
      const deployments = await database.db
        .selectFrom("deployments")
        .select(["id", "logs"])
        .orderBy("id")
        .execute();

      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 0,
        countsByProviderKey: {
          "generic-ssh": 1,
        },
      });
      expect(afterDryRunRows.map((row) => row.id)).toEqual([
        "pjl_cutoff_equal",
        "pjl_match",
        "pjl_newer",
        "pjl_other_provider",
        "pjl_other_resource",
      ]);
      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 1,
        countsByProviderKey: {
          "generic-ssh": 1,
        },
      });
      expect(remainingProviderLogs.map((row) => row.id)).toEqual([
        "pjl_cutoff_equal",
        "pjl_newer",
        "pjl_other_provider",
        "pjl_other_resource",
      ]);
      expect(deployments.map((row) => row.id)).toEqual(["dep_api", "dep_web"]);
      expect(deployments.find((row) => row.id === "dep_web")?.logs).toEqual([
        {
          level: "info",
          message: "deployment log retained",
        },
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
