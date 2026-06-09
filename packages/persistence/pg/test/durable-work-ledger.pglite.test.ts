import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

function context() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_durable_work_ledger_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

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

  test("[PROC-DELIVERY-WORKER-016] records, claims, completes, and sanitizes durable work", async () => {
    const { createDatabase, createMigrator, PgDurableWorkLedger } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-durable-work-ledger-adapter-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const ledger = new PgDurableWorkLedger(database.db);
    const repositoryContext = context();

    const recorded = await ledger.recordItem(repositoryContext, {
      id: "dw_deploy_2",
      kind: "deployment",
      status: "pending",
      operationKey: "deployments.create",
      queueBackend: "database",
      dedupeKey: "deployments.create:dep_2",
      correlationId: "req_durable_2",
      requestId: "req_durable_2",
      projectId: "prj_2",
      environmentId: "env_2",
      resourceId: "res_2",
      deploymentId: "dep_2",
      serverId: "srv_2",
      subjectKind: "deployment",
      subjectId: "dep_2",
      phase: "accepted",
      step: "queued",
      priority: 20,
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      safeInput: {
        source: "git",
        token: "SECRET_raw",
      },
      safeDetails: {
        deploymentId: "dep_2",
        commandLine: "PRIVATE_KEY=raw-value docker build",
      },
    });
    expect(recorded.isOk()).toBe(true);
    if (recorded.isErr()) throw new Error(recorded.error.message);
    expect(recorded.value.safeInput).toEqual({ source: "git" });
    expect(recorded.value.safeDetails).toEqual({ deploymentId: "dep_2" });

    const appended = await ledger.appendEvent(repositoryContext, {
      id: "dwe_deploy_2_1",
      workItemId: "dw_deploy_2",
      sequence: 1,
      kind: "accepted",
      status: "pending",
      phase: "accepted",
      step: "queued",
      message: "Deployment work was accepted.",
      occurredAt: "2026-06-08T00:00:00.000Z",
      safeDetails: {
        deploymentId: "dep_2",
        privateKey: "raw-secret",
      },
    });
    expect(appended.isOk()).toBe(true);

    const candidates = await ledger.listDueCandidates(repositoryContext, {
      now: "2026-06-08T00:00:01.000Z",
      operationKey: "deployments.create",
    });
    expect(candidates.isOk()).toBe(true);
    if (candidates.isErr()) throw new Error(candidates.error.message);
    expect(candidates.value.map((item) => item.id)).toEqual(["dw_deploy_2"]);

    const claimed = await ledger.claimDue(repositoryContext, {
      workItemId: "dw_deploy_2",
      workerId: "cloud-deployment-worker-1",
      workerGroup: "cloud-deployment-worker",
      claimedAt: "2026-06-08T00:00:02.000Z",
      leaseExpiresAt: "2026-06-08T00:05:02.000Z",
      safeDetails: {
        hostname: "worker-a",
        token: "SECRET_raw",
      },
    });
    expect(claimed.isOk()).toBe(true);
    if (claimed.isErr()) throw new Error(claimed.error.message);
    expect(claimed.value.status).toBe("claimed");
    if (claimed.value.status !== "claimed") throw new Error("Expected claim to succeed");
    expect(claimed.value.workItem).toMatchObject({
      status: "running",
      attemptCount: 1,
      leaseOwner: "cloud-deployment-worker-1",
      phase: "worker-claim",
      step: "claimed",
    });
    expect(claimed.value.workItem.safeDetails).toEqual({
      deploymentId: "dep_2",
      claimedAt: "2026-06-08T00:00:02.000Z",
      claimedBy: "cloud-deployment-worker-1",
      hostname: "worker-a",
    });

    const duplicateClaim = await ledger.claimDue(repositoryContext, {
      workItemId: "dw_deploy_2",
      workerId: "cloud-deployment-worker-2",
      claimedAt: "2026-06-08T00:00:03.000Z",
      leaseExpiresAt: "2026-06-08T00:05:03.000Z",
    });
    expect(duplicateClaim.isOk()).toBe(true);
    if (duplicateClaim.isErr()) throw new Error(duplicateClaim.error.message);
    expect(duplicateClaim.value.status).toBe("refused");
    if (duplicateClaim.value.status !== "refused") throw new Error("Expected claim refusal");
    expect(duplicateClaim.value.reason).toBe("not-claimable");

    const completed = await ledger.complete(repositoryContext, {
      workItemId: "dw_deploy_2",
      status: "succeeded",
      completedAt: "2026-06-08T00:10:00.000Z",
      phase: "release",
      step: "finished",
      safeDetails: {
        imageDigest: "sha256:abc",
        password: "raw-secret",
      },
    });
    expect(completed.isOk()).toBe(true);
    if (completed.isErr()) throw new Error(completed.error.message);
    expect(completed.value.status).toBe("completed");
    if (completed.value.status !== "completed") throw new Error("Expected completion");
    expect(completed.value.workItem).toMatchObject({
      status: "succeeded",
      phase: "release",
      step: "finished",
      finishedAt: "2026-06-08T00:10:00.000Z",
    });
    expect(completed.value.workItem).not.toHaveProperty("leaseOwner");
    expect(completed.value.workItem).not.toHaveProperty("leaseExpiresAt");
    expect(completed.value.workItem.safeDetails).toEqual({
      deploymentId: "dep_2",
      claimedAt: "2026-06-08T00:00:02.000Z",
      claimedBy: "cloud-deployment-worker-1",
      hostname: "worker-a",
      imageDigest: "sha256:abc",
    });

    const listed = await ledger.listItems(repositoryContext, {
      deploymentId: "dep_2",
      status: "succeeded",
    });
    expect(listed.isOk()).toBe(true);
    if (listed.isErr()) throw new Error(listed.error.message);
    expect(listed.value.map((item) => item.id)).toEqual(["dw_deploy_2"]);

    const events = await ledger.listEvents(repositoryContext, "dw_deploy_2");
    expect(events.isOk()).toBe(true);
    if (events.isErr()) throw new Error(events.error.message);
    expect(events.value).toEqual([
      {
        id: "dwe_deploy_2_1",
        workItemId: "dw_deploy_2",
        sequence: 1,
        kind: "accepted",
        status: "pending",
        phase: "accepted",
        step: "queued",
        message: "Deployment work was accepted.",
        occurredAt: "2026-06-08T00:00:00.000Z",
        safeDetails: {
          deploymentId: "dep_2",
        },
      },
    ]);

    await database.close();
  });
});
