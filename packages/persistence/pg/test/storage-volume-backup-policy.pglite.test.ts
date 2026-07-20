import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type StorageVolumeBackupPolicyRecord,
  toRepositoryContext,
} from "@appaloft/application";

import { createDatabase, createMigrator, PgStorageVolumeBackupPolicyRepository } from "../src";

describe("storage volume backup policy persistence", () => {
  test("[STOR-BACKUP-AUTO-PERSIST-007][STOR-BACKUP-AUTO-IDPOTENT-006] persists readback and atomically leases one due run", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-storage-backup-policy-"));
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    try {
      const migrated = await createMigrator(database.db).migrateToLatest();
      expect(migrated.error).toBeUndefined();
      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_storage_backup_policy",
          entrypoint: "system",
          actor: { kind: "system", id: "test" },
        }),
      );
      const repository = new PgStorageVolumeBackupPolicyRepository(database.db);
      const policy: StorageVolumeBackupPolicyRecord = {
        id: "sbp_pglite",
        version: "v1",
        storageVolumeId: "stv_pglite",
        planRequest: {
          source: { storageVolumeId: "stv_pglite", dataFormat: "filesystem", liveWrites: false },
          requestedConsistency: "crash-consistent",
          target: { providerKey: "s3-compatible", targetRef: "s3://backup/pglite" },
          retention: { maxCount: 3, maxAgeDays: 7 },
        },
        scheduledEnabled: true,
        preDeployEnabled: true,
        scheduleIntervalHours: 24,
        retryOnFailure: true,
        failureMode: "block",
        notificationRef: "webhook:backup-alerts",
        lastRunAt: null,
        nextRunAt: "2026-07-20T00:00:00.000Z",
        lastTrigger: null,
        lastStatus: "never",
        lastBackupId: null,
        lastProcessAttemptId: null,
        lastPrunedCount: 0,
        lastNotificationStatus: "not-requested",
        lastErrorCode: null,
        updatedAt: "2026-07-20T00:00:00.000Z",
      };
      expect((await repository.upsert(context, policy)).isOk()).toBe(true);
      expect((await repository.findOne(context, policy.id))._unsafeUnwrap()).toEqual(policy);

      const claim = {
        policyId: policy.id,
        dueAt: "2026-07-20T00:00:00.000Z",
        claimUntil: "2026-07-20T00:10:00.000Z",
      };
      expect((await repository.claimScheduledRun(context, claim))._unsafeUnwrap()).toBe(true);
      expect((await repository.claimScheduledRun(context, claim))._unsafeUnwrap()).toBe(false);
      expect(
        (
          await repository.listRecords(context, { dueAt: claim.dueAt, scheduledEnabledOnly: true })
        )._unsafeUnwrap(),
      ).toEqual([]);

      const recorded = await repository.recordRun(context, {
        id: policy.id,
        lastRunAt: "2026-07-20T00:01:00.000Z",
        nextRunAt: "2026-07-21T00:00:00.000Z",
        lastTrigger: "scheduled",
        lastStatus: "succeeded",
        lastBackupId: "svb_pglite",
        lastProcessAttemptId: "wrk_pglite",
        lastPrunedCount: 2,
        lastNotificationStatus: "not-requested",
        lastErrorCode: null,
        updatedAt: "2026-07-20T00:01:00.000Z",
      });
      expect(recorded.isOk()).toBe(true);
      expect(recorded._unsafeUnwrap()).toMatchObject({
        lastStatus: "succeeded",
        lastBackupId: "svb_pglite",
        lastPrunedCount: 2,
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
