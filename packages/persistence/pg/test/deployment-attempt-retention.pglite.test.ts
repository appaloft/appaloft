import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { ArchivedAt, DeploymentByIdSpec, DeploymentId, UpsertDeploymentSpec } from "@appaloft/core";
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
    .values({
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
    })
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
    .values({
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
    })
    .execute();
}

async function archiveBaseRows(db: Kysely<Database>): Promise<void> {
  await db
    .updateTable("projects")
    .set({
      lifecycle_status: "archived",
      archived_at: "2026-01-01T00:00:10.000Z",
      archive_reason: "cleanup",
    })
    .where("id", "=", "prj_demo")
    .execute();
  await db
    .updateTable("resources")
    .set({
      lifecycle_status: "archived",
      archived_at: "2026-01-01T00:00:11.000Z",
      archive_reason: "cleanup",
    })
    .where("id", "=", "res_web")
    .execute();
}

async function seedDeployment(
  db: Kysely<Database>,
  input: {
    id: string;
    archivedAt?: string | null;
  },
): Promise<void> {
  await db
    .insertInto("deployments")
    .values({
      id: input.id,
      project_id: "prj_demo",
      environment_id: "env_demo",
      resource_id: "res_web",
      server_id: "srv_primary",
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
          serverIds: ["srv_primary"],
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
      logs: [],
      created_at: "2026-01-01T00:00:00.000Z",
      started_at: "2026-01-01T00:00:01.000Z",
      finished_at: "2026-01-01T00:00:04.000Z",
      trigger_kind: "create",
      source_deployment_id: null,
      rollback_candidate_deployment_id: null,
      rollback_of_deployment_id: null,
      supersedes_deployment_id: null,
      superseded_by_deployment_id: null,
      archived_at: input.archivedAt ?? null,
    })
    .execute();
}

function repositoryContext() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_deployment_attempt_retention_test",
    }),
  );
}

describe("deployment attempt retention persistence", () => {
  test("[DEP-ARCHIVE-004] archives terminal deployments after parent project and resource archive", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-deployment-archive-parent-"));
    const { createDatabase, createMigrator, PgDeploymentRepository } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedBaseRows(database.db);
      await seedDeployment(database.db, {
        id: "dep_archive_parent",
      });
      await archiveBaseRows(database.db);

      const context = repositoryContext();
      const repository = new PgDeploymentRepository(database.db);
      const deployment = await repository.findOne(
        context,
        DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_archive_parent")),
      );
      expect(deployment).not.toBeNull();
      if (!deployment) {
        throw new Error("deployment fixture was not persisted");
      }

      const archiveResult = deployment.archive(ArchivedAt.rehydrate("2026-01-01T00:01:00.000Z"));
      expect(archiveResult.isOk()).toBe(true);

      const updateResult = await repository.updateOne(
        context,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      expect(updateResult.isOk()).toBe(true);

      const row = await database.db
        .selectFrom("deployments")
        .select(["id", "archived_at"])
        .where("id", "=", "dep_archive_parent")
        .executeTakeFirstOrThrow();
      expect(new Date(row.archived_at ?? "").toISOString()).toBe("2026-01-01T00:01:00.000Z");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[DEP-PRUNE-002] destructively prunes only unreferenced archived terminal deployments", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-deployment-attempt-retention-"));
    const { createDatabase, createMigrator, PgDeploymentAttemptRetentionStore } = await import(
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
        id: "dep_prunable",
        archivedAt: "2026-01-01T00:01:00.000Z",
      });
      await seedDeployment(database.db, {
        id: "dep_guarded",
        archivedAt: "2026-01-01T00:01:00.000Z",
      });
      await seedDeployment(database.db, {
        id: "dep_fresh",
        archivedAt: "2026-01-01T00:07:00.000Z",
      });
      await database.db
        .insertInto("provider_job_logs")
        .values({
          id: "pjl_guarded",
          deployment_id: "dep_guarded",
          provider_key: "generic-ssh",
          payload: {},
          created_at: "2026-01-01T00:01:00.000Z",
        })
        .execute();

      const store = new PgDeploymentAttemptRetentionStore(database.db);
      const result = await store.prune(repositoryContext(), {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        matchedCount: 2,
        guardedCount: 1,
        prunedCount: 1,
        affectedDeploymentIds: ["dep_prunable"],
        guardedDeploymentIds: ["dep_guarded"],
      });

      const rows = await database.db.selectFrom("deployments").select("id").orderBy("id").execute();
      const providerLogs = await database.db.selectFrom("provider_job_logs").select("id").execute();

      expect(rows.map((row) => row.id)).toEqual(["dep_fresh", "dep_guarded"]);
      expect(providerLogs.map((row) => row.id)).toEqual(["pjl_guarded"]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
