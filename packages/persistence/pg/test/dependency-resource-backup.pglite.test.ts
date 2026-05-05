import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DependencyResourceBackup,
  DependencyResourceBackupAttemptId,
  DependencyResourceBackupByIdSpec,
  DependencyResourceBackupId,
  DependencyResourceBackupRetentionStatusValue,
  DependencyResourceBackupsByDependencyResourceSpec,
  DependencyResourceProviderArtifactHandle,
  DependencyResourceRestoreAttemptId,
  EnvironmentId,
  OccurredAt,
  ProjectId,
  ProviderKey,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  UpsertDependencyResourceBackupSpec,
} from "@appaloft/core";

describe("dependency resource backup persistence", () => {
  test("[DEP-RES-BACKUP-002] [DEP-RES-BACKUP-007] [DEP-RES-BACKUP-010] persists backup metadata and delete blockers", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-backup-"));
    const {
      createDatabase,
      createMigrator,
      PgDependencyResourceBackupReadModel,
      PgDependencyResourceBackupRepository,
      PgDependencyResourceDeleteSafetyReader,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_dependency_resource_backup_pglite_test",
          entrypoint: "system",
        }),
      );
      const repository = new PgDependencyResourceBackupRepository(database.db);
      const readModel = new PgDependencyResourceBackupReadModel(database.db);
      const deleteSafetyReader = new PgDependencyResourceDeleteSafetyReader(database.db);
      const backup = DependencyResourceBackup.createPending({
        id: DependencyResourceBackupId.rehydrate("drb_1"),
        dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        dependencyKind: ResourceInstanceKindValue.rehydrate("postgres"),
        providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
        attemptId: DependencyResourceBackupAttemptId.rehydrate("dba_1"),
        requestedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      backup
        .markReady({
          providerArtifactHandle:
            DependencyResourceProviderArtifactHandle.rehydrate("backup/rsi_pg/drb_1"),
          completedAt: OccurredAt.rehydrate("2026-01-01T00:00:01.000Z"),
          retentionStatus: DependencyResourceBackupRetentionStatusValue.retained(),
        })
        ._unsafeUnwrap();
      const restoreAttemptId = DependencyResourceRestoreAttemptId.rehydrate("dra_1");
      backup
        .startRestore({
          attemptId: restoreAttemptId,
          requestedAt: OccurredAt.rehydrate("2026-01-01T00:01:00.000Z"),
        })
        ._unsafeUnwrap();
      backup
        .markRestoreCompleted({
          attemptId: restoreAttemptId,
          completedAt: OccurredAt.rehydrate("2026-01-01T00:02:00.000Z"),
        })
        ._unsafeUnwrap();

      await repository.upsert(
        context,
        backup,
        UpsertDependencyResourceBackupSpec.fromDependencyResourceBackup(backup),
      );

      const persisted = await repository.findOne(
        context,
        DependencyResourceBackupByIdSpec.create(DependencyResourceBackupId.rehydrate("drb_1")),
      );
      const listed = await readModel.list(context, { dependencyResourceId: "rsi_pg" });
      const shown = await readModel.findOne(
        context,
        DependencyResourceBackupByIdSpec.create(DependencyResourceBackupId.rehydrate("drb_1")),
      );
      const many = await repository.findMany(
        context,
        DependencyResourceBackupsByDependencyResourceSpec.create(
          ResourceInstanceId.rehydrate("rsi_pg"),
        ),
      );
      const blockers = await deleteSafetyReader.findBlockers(context, {
        dependencyResourceId: "rsi_pg",
      });

      expect(persisted?.toState().latestRestoreAttempt?.status.value).toBe("completed");
      expect(listed).toHaveLength(1);
      expect(shown).toMatchObject({
        id: "drb_1",
        status: "ready",
        retentionStatus: "retained",
        latestRestoreAttempt: {
          status: "completed",
        },
      });
      expect(many).toHaveLength(1);
      expect(blockers._unsafeUnwrap()).toContainEqual(
        expect.objectContaining({
          kind: "dependency-resource-backup",
          count: 1,
        }),
      );
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
