import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

function context() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_durable_worker_heartbeat_store_test",
    }),
  );
}

describe("durable worker heartbeat store persistence", () => {
  test("[PROC-DELIVERY-WORKER-033] claims distinct replica worker ids for leased slots", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-durable-worker-heartbeats-"));
    const { createDatabase, createMigrator, PgDurableWorkerHeartbeatStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      const store = new PgDurableWorkerHeartbeatStore(database.db);
      const repositoryContext = context();
      const claims = [];
      for (let index = 1; index <= 4; index += 1) {
        const claimed = await store.claimWorkerSlot(repositoryContext, {
          workerGroup: "cloud-deployment-worker",
          workerCount: 4,
          leaseOwnerId: `replica-${index}`,
          workerId: `cloud-deployment-worker-replica-${index}`,
          mode: "standalone",
          queueBackend: "database",
          processStartedAt: `2026-06-11T00:00:0${index}.000Z`,
          lastSeenAt: `2026-06-11T00:00:1${index}.000Z`,
          staleBefore: "2026-06-10T23:59:59.000Z",
        });
        expect(claimed.isOk()).toBe(true);
        claims.push(claimed._unsafeUnwrap());
      }

      expect(claims.map((claim) => claim?.workerId).sort()).toEqual([
        "cloud-deployment-worker-replica-1",
        "cloud-deployment-worker-replica-2",
        "cloud-deployment-worker-replica-3",
        "cloud-deployment-worker-replica-4",
      ]);
      expect(claims.map((claim) => claim?.slot).sort()).toEqual([1, 2, 3, 4]);

      const fifth = await store.claimWorkerSlot(repositoryContext, {
        workerGroup: "cloud-deployment-worker",
        workerCount: 4,
        leaseOwnerId: "replica-5",
        workerId: "cloud-deployment-worker-replica-5",
        mode: "standalone",
        queueBackend: "database",
        processStartedAt: "2026-06-11T00:00:05.000Z",
        lastSeenAt: "2026-06-11T00:00:15.000Z",
        staleBefore: "2026-06-10T23:59:59.000Z",
      });
      expect(fifth.isOk()).toBe(true);
      expect(fifth._unsafeUnwrap()).toBeNull();

      const readback = await store.listHeartbeats(repositoryContext, {
        workerGroup: "cloud-deployment-worker",
      });
      expect(readback.isOk()).toBe(true);
      expect(
        readback
          ._unsafeUnwrap()
          .map((heartbeat) => heartbeat.workerId)
          .sort(),
      ).toEqual([
        "cloud-deployment-worker-replica-1",
        "cloud-deployment-worker-replica-2",
        "cloud-deployment-worker-replica-3",
        "cloud-deployment-worker-replica-4",
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
