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
        target_kind: "server",
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
        target_kind: "server",
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
  await db
    .insertInto("deployments")
    .values([
      deploymentRow("dep_web", "res_web", "srv_primary"),
      deploymentRow("dep_api", "res_api", "srv_secondary"),
    ])
    .execute();
}

function deploymentRow(id: string, resourceId: string, serverId: string) {
  return {
    id,
    project_id: "prj_demo",
    environment_id: "env_demo",
    resource_id: resourceId,
    server_id: serverId,
    destination_id: "dst_demo",
    status: "succeeded",
    runtime_plan: {
      id: `rplan_${id}`,
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
        serverIds: [serverId],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["start process"],
    },
    environment_snapshot: {
      id: `snap_${id}`,
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["environment", "deployment"],
      variables: [],
    },
    dependency_binding_references: [],
    logs: [],
    created_at: "2026-01-01T00:00:00.000Z",
    started_at: "2026-01-01T00:00:01.000Z",
    finished_at: "2026-01-01T00:00:04.000Z",
    trigger_kind: "manual",
    source_deployment_id: null,
    rollback_candidate_deployment_id: null,
    rollback_of_deployment_id: null,
    supersedes_deployment_id: null,
    superseded_by_deployment_id: null,
  };
}

describe("resource runtime log archive persistence", () => {
  test("[RUNTIME-LOG-ARCHIVE-002][RUNTIME-LOG-ARCHIVE-004] stores, reads, and prunes scoped archive snapshots", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-log-archive-"));
    const {
      createDatabase,
      createMigrator,
      PgResourceDeletionBlockerReader,
      PgResourceRuntimeLogArchiveStore,
      PgServerDeletionBlockerReader,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedBaseRows(database.db);

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_runtime_log_archive_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgResourceRuntimeLogArchiveStore(database.db);

      await store.create(context, {
        archiveId: "rla_old_match",
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_primary",
        serviceName: "web",
        runtimeKind: "docker-container",
        capturedAt: "2026-01-01T00:00:00.000Z",
        reason: "support",
        lines: [
          {
            resourceId: "res_web",
            deploymentId: "dep_web",
            serviceName: "web",
            runtimeKind: "docker-container",
            timestamp: "2026-01-01T00:00:00.000Z",
            stream: "stdout",
            message: "token=********",
            masked: true,
          },
        ],
      });
      await store.create(context, {
        archiveId: "rla_cutoff_equal",
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_primary",
        serviceName: "web",
        runtimeKind: "docker-container",
        capturedAt: "2026-01-01T00:05:00.000Z",
        lines: [],
      });
      await store.create(context, {
        archiveId: "rla_other_resource",
        resourceId: "res_api",
        deploymentId: "dep_api",
        serverId: "srv_secondary",
        serviceName: "api",
        runtimeKind: "docker-container",
        capturedAt: "2026-01-01T00:00:00.000Z",
        lines: [],
      });

      const list = await store.list(context, {
        resourceId: "res_web",
        limit: 10,
      });
      const show = await store.findOne(context, {
        archiveId: "rla_old_match",
      });
      const prune = await store.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        resourceId: "res_web",
        dryRun: false,
      });
      const resourceBlockers = await new PgResourceDeletionBlockerReader(database.db).findBlockers(
        context,
        {
          resourceId: "res_api",
        },
      );
      const serverBlockers = await new PgServerDeletionBlockerReader(database.db).findBlockers(
        context,
        {
          serverId: "srv_secondary",
        },
      );
      const remaining = await database.db
        .selectFrom("resource_runtime_log_archives")
        .select(["id"])
        .orderBy("id")
        .execute();

      expect(list.isOk()).toBe(true);
      expect(list._unsafeUnwrap().items.map((item) => item.archiveId)).toEqual([
        "rla_cutoff_equal",
        "rla_old_match",
      ]);
      expect(show.isOk()).toBe(true);
      expect(show._unsafeUnwrap()?.lines[0]?.message).toBe("token=********");
      expect(prune.isOk()).toBe(true);
      expect(prune._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 1,
        affectedResourceCount: 1,
      });
      expect(resourceBlockers.isOk()).toBe(true);
      expect(resourceBlockers._unsafeUnwrap()).toContainEqual({
        kind: "runtime-log-retention",
        relatedEntityId: "rla_other_resource",
        relatedEntityType: "runtime-log-archive",
        count: 1,
      });
      expect(serverBlockers.isOk()).toBe(true);
      expect(serverBlockers._unsafeUnwrap()).toContainEqual({
        kind: "runtime-log-retention",
        relatedEntityId: "rla_other_resource",
        relatedEntityType: "runtime-log-archive",
        count: 1,
      });
      expect(remaining.map((row) => row.id)).toEqual(["rla_cutoff_equal", "rla_other_resource"]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
