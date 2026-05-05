import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { ResourceByIdSpec, ResourceId } from "@appaloft/core";

describe("resource runtime control attempt persistence", () => {
  test("[RUNTIME-CTRL-READ-001] persists latest runtime-control attempt for resource health readback", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-control-attempts-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const {
        createDatabase,
        createMigrator,
        PgResourceReadModel,
        PgResourceRuntimeControlAttemptRecorder,
      } = await import("../src");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedRuntimeControlResource(database.db);

      const context = toRepositoryContext(
        createExecutionContext({
          entrypoint: "system",
          requestId: "req_runtime_control_attempt_pglite_test",
        }),
      );
      const recorder = new PgResourceRuntimeControlAttemptRecorder(database.db);
      const readModel = new PgResourceReadModel(database.db);

      const running = await recorder.record(context, {
        runtimeControlAttemptId: "rtc_pg_0001",
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        operation: "restart",
        status: "running",
        startedAt: "2026-01-01T00:00:10.000Z",
        runtimeState: "restarting",
        phases: [
          {
            phase: "stop",
            status: "pending",
          },
          {
            phase: "start",
            status: "pending",
          },
        ],
      });
      expect(running.isOk()).toBe(true);

      const terminal = await recorder.record(context, {
        runtimeControlAttemptId: "rtc_pg_0001",
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        operation: "restart",
        status: "failed",
        startedAt: "2026-01-01T00:00:10.000Z",
        completedAt: "2026-01-01T00:00:15.000Z",
        runtimeState: "stopped",
        errorCode: "resource_runtime_control_failed",
        phases: [
          {
            phase: "stop",
            status: "succeeded",
          },
          {
            phase: "start",
            status: "failed",
            errorCode: "resource_runtime_control_failed",
          },
        ],
      });
      expect(terminal.isOk()).toBe(true);

      const summary = await readModel.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
      );
      const attempts = await database.db
        .selectFrom("resource_runtime_control_attempts")
        .selectAll()
        .execute();

      expect(attempts).toHaveLength(1);
      expect(summary?.latestRuntimeControl).toEqual({
        runtimeControlAttemptId: "rtc_pg_0001",
        operation: "restart",
        status: "failed",
        startedAt: "2026-01-01T00:00:10.000Z",
        completedAt: "2026-01-01T00:00:15.000Z",
        runtimeState: "stopped",
        errorCode: "resource_runtime_control_failed",
        phases: [
          {
            phase: "stop",
            status: "succeeded",
          },
          {
            phase: "start",
            status: "failed",
            errorCode: "resource_runtime_control_failed",
          },
        ],
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);
});

async function seedRuntimeControlResource(
  db: Awaited<ReturnType<typeof import("../src").createDatabase>>["db"],
) {
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
      id: "srv_demo",
      name: "Demo Server",
      host: "127.0.0.1",
      port: 22,
      provider_key: "local-shell",
      lifecycle_status: "active",
      deactivated_at: null,
      deactivation_reason: null,
      deleted_at: null,
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
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: "dst_demo",
      server_id: "srv_demo",
      name: "default",
      kind: "server",
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
      kind: "application",
      description: null,
      services: [
        {
          name: "web",
          kind: "web",
        },
      ],
      source_binding: null,
      runtime_profile: null,
      network_profile: null,
      access_profile: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      deleted_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("deployments")
    .values({
      id: "dep_web",
      project_id: "prj_demo",
      environment_id: "env_demo",
      resource_id: "res_web",
      server_id: "srv_demo",
      destination_id: "dst_demo",
      status: "succeeded",
      runtime_plan: {
        id: "rplan_demo",
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
          providerKey: "local-shell",
          serverIds: ["srv_demo"],
        },
        detectSummary: "detected workspace",
        generatedAt: "2026-01-01T00:00:00.000Z",
        steps: ["start process"],
      },
      environment_snapshot: {
        id: "snap_demo",
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
    })
    .execute();
}
