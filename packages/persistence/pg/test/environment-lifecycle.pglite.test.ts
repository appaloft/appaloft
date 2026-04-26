import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  ArchivedAt,
  ArchiveReason,
  CreatedAt,
  EnvironmentByIdSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  LockedAt,
  LockReason,
  Project,
  ProjectId,
  ProjectName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@appaloft/core";

describe("environment lifecycle persistence", () => {
  test("[ENV-LIFE-PERSIST-001] persists archived environment lifecycle metadata", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-env-life-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentReadModel,
      PgEnvironmentRepository,
      PgProjectRepository,
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
          requestId: "req_env_lifecycle_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const readModel = new PgEnvironmentReadModel(database.db, "****");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const environment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate("env_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );

      environment
        .archive({
          archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:10.000Z"),
          reason: ArchiveReason.rehydrate("Retired"),
        })
        ._unsafeUnwrap();
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );

      const persisted = await environments.findOne(
        context,
        EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
      );
      expect(persisted?.toState().lifecycleStatus.value).toBe("archived");
      expect(persisted?.toState().archivedAt?.value).toBe("2026-01-01T00:00:10.000Z");
      expect(persisted?.toState().archiveReason?.value).toBe("Retired");

      const summary = await readModel.findOne(
        context,
        EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
      );
      expect(summary).toMatchObject({
        id: "env_demo",
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:10.000Z",
        archiveReason: "Retired",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[ENV-LIFE-PERSIST-002] persists locked environment lifecycle metadata", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-env-lock-life-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentReadModel,
      PgEnvironmentRepository,
      PgProjectRepository,
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
          requestId: "req_env_lock_lifecycle_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const readModel = new PgEnvironmentReadModel(database.db, "****");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const environment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate("env_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );

      environment
        .lock({
          lockedAt: LockedAt.rehydrate("2026-01-01T00:00:10.000Z"),
          reason: LockReason.rehydrate("Change freeze"),
        })
        ._unsafeUnwrap();
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );

      const persisted = await environments.findOne(
        context,
        EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
      );
      expect(persisted?.toState().lifecycleStatus.value).toBe("locked");
      expect(persisted?.toState().lockedAt?.value).toBe("2026-01-01T00:00:10.000Z");
      expect(persisted?.toState().lockReason?.value).toBe("Change freeze");

      const summary = await readModel.findOne(
        context,
        EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
      );
      expect(summary).toMatchObject({
        id: "env_demo",
        lifecycleStatus: "locked",
        lockedAt: "2026-01-01T00:00:10.000Z",
        lockReason: "Change freeze",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
