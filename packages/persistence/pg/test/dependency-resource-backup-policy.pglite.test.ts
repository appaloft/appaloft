import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

describe("dependency resource backup policy persistence", () => {
  test("[DEP-RES-BACKUP-POLICY-001] [DEP-RES-BACKUP-POLICY-002] persists and filters scheduled backup policies", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-backup-policy-"));
    const { createDatabase, createMigrator, PgDependencyResourceBackupPolicyRepository } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_dependency_resource_backup_policy_pglite_test",
          entrypoint: "system",
        }),
      );
      const repository = new PgDependencyResourceBackupPolicyRepository(database.db);

      await repository.upsert(context, {
        id: "dbp_pg",
        version: "v1",
        dependencyResourceId: "rsi_pg",
        retentionDays: 14,
        scheduleIntervalHours: 6,
        providerKey: "appaloft-managed-postgres",
        retryOnFailure: true,
        enabled: true,
        lastRunAt: null,
        nextRunAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      });
      await repository.upsert(context, {
        id: "dbp_redis",
        version: "v1",
        dependencyResourceId: "rsi_redis",
        retentionDays: 7,
        scheduleIntervalHours: 12,
        providerKey: null,
        retryOnFailure: false,
        enabled: false,
        lastRunAt: null,
        nextRunAt: "2026-01-16T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      });

      const due = await repository.listRecords(context, {
        enabledOnly: true,
        dueAt: "2026-01-15T00:00:00.000Z",
      });
      const shown = await repository.findOne(context, "dbp_pg");
      const marked = await repository.markRun(context, {
        policyId: "dbp_pg",
        lastRunAt: "2026-01-15T00:00:00.000Z",
        nextRunAt: "2026-01-15T06:00:00.000Z",
        updatedAt: "2026-01-15T00:00:01.000Z",
      });

      expect(due._unsafeUnwrap().map((record) => record.id)).toEqual(["dbp_pg"]);
      expect(shown._unsafeUnwrap()).toMatchObject({
        id: "dbp_pg",
        dependencyResourceId: "rsi_pg",
        retentionDays: 14,
        scheduleIntervalHours: 6,
        providerKey: "appaloft-managed-postgres",
      });
      expect(marked._unsafeUnwrap()).toMatchObject({
        id: "dbp_pg",
        lastRunAt: "2026-01-15T00:00:00.000Z",
        nextRunAt: "2026-01-15T06:00:00.000Z",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
