import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("durable work ledger persistence", () => {
  test("[PROC-DELIVERY-WORKER-014] migrates durable work item and event ledger tables", async () => {
    const { createDatabase, createMigrator } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-durable-work-ledger-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();

    await database.db
      .insertInto("durable_work_items")
      .values({
        id: "dw_deploy_1",
        kind: "deployment",
        status: "pending",
        operation_key: "deployments.create",
        queue_backend: "database",
        dedupe_key: "deployments.create:dep_1",
        correlation_id: "req_durable_1",
        request_id: "req_durable_1",
        project_id: "prj_1",
        environment_id: "env_1",
        resource_id: "res_1",
        deployment_id: "dep_1",
        server_id: "srv_1",
        subject_kind: "deployment",
        subject_id: "dep_1",
        phase: "accepted",
        step: "queued",
        priority: 10,
        attempt_count: 0,
        max_attempts: 3,
        available_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        safe_input: {
          source: "git",
        },
        safe_details: {
          deploymentId: "dep_1",
        },
      })
      .execute();

    await database.db
      .insertInto("durable_work_events")
      .values([
        {
          id: "dwe_deploy_1_1",
          work_item_id: "dw_deploy_1",
          sequence: 1,
          kind: "accepted",
          status: "pending",
          phase: "accepted",
          step: "queued",
          message: "Deployment work was accepted.",
          occurred_at: "2026-06-08T00:00:00.000Z",
          safe_details: {
            deploymentId: "dep_1",
          },
        },
        {
          id: "dwe_deploy_1_2",
          work_item_id: "dw_deploy_1",
          sequence: 2,
          kind: "progress",
          status: "running",
          phase: "build",
          step: "docker-build",
          message: "Build started.",
          worker_id: "cloud-deployment-worker-1",
          worker_group: "cloud-deployment-worker",
          occurred_at: "2026-06-08T00:00:01.000Z",
          safe_details: {
            imageTag: "dep_1",
          },
        },
      ])
      .execute();

    const item = await database.db
      .selectFrom("durable_work_items")
      .selectAll()
      .where("id", "=", "dw_deploy_1")
      .executeTakeFirstOrThrow();
    const events = await database.db
      .selectFrom("durable_work_events")
      .select(["sequence", "kind", "status", "phase", "step", "worker_id"])
      .where("work_item_id", "=", "dw_deploy_1")
      .orderBy("sequence", "asc")
      .execute();

    expect(item).toMatchObject({
      id: "dw_deploy_1",
      kind: "deployment",
      status: "pending",
      operation_key: "deployments.create",
      queue_backend: "database",
      dedupe_key: "deployments.create:dep_1",
      priority: 10,
      max_attempts: 3,
    });
    expect(events).toEqual([
      {
        sequence: 1,
        kind: "accepted",
        status: "pending",
        phase: "accepted",
        step: "queued",
        worker_id: null,
      },
      {
        sequence: 2,
        kind: "progress",
        status: "running",
        phase: "build",
        step: "docker-build",
        worker_id: "cloud-deployment-worker-1",
      },
    ]);

    await database.db.deleteFrom("durable_work_items").where("id", "=", "dw_deploy_1").execute();
    const remainingEvents = await database.db
      .selectFrom("durable_work_events")
      .select("id")
      .where("work_item_id", "=", "dw_deploy_1")
      .execute();
    expect(remainingEvents).toEqual([]);

    await database.close();
  });
});
