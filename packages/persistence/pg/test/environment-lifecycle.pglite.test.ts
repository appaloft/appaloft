import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  ArchivedAt,
  ArchiveReason,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  EnvironmentByIdSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  Project,
  ProjectId,
  ProjectName,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  VariableExposureValue,
  VariableKindValue,
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

  test("[ENV-LIFE-CLONE-PERSIST-001] persists cloned environment parent and variables", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-env-clone-"));
    const { createDatabase, createMigrator, PgEnvironmentRepository, PgProjectRepository } =
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
          requestId: "req_env_clone_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
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
      environment
        .setVariable({
          key: ConfigKey.rehydrate("DATABASE_URL"),
          value: ConfigValueText.rehydrate("postgres://source"),
          kind: VariableKindValue.rehydrate("secret"),
          exposure: VariableExposureValue.rehydrate("runtime"),
          scope: ConfigScopeValue.rehydrate("environment"),
          isSecret: true,
          updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
        })
        ._unsafeUnwrap();
      const cloned = environment
        .cloneTo({
          targetEnvironmentId: EnvironmentId.rehydrate("env_clone"),
          targetName: EnvironmentName.rehydrate("production-copy"),
          createdAt: CreatedAt.rehydrate("2026-01-01T00:00:10.000Z"),
        })
        ._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await environments.upsert(context, cloned, UpsertEnvironmentSpec.fromEnvironment(cloned));

      const persisted = await environments.findOne(
        context,
        EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_clone")),
      );
      const state = persisted?.toState();
      const variables = state?.variables.toState() ?? [];

      expect(state?.parentEnvironmentId?.value).toBe("env_demo");
      expect(state?.lifecycleStatus.value).toBe("active");
      expect(variables).toHaveLength(1);
      expect(variables[0]?.key.value).toBe("DATABASE_URL");
      expect(variables[0]?.value.value).toBe("postgres://source");
      expect(variables[0]?.isSecret).toBe(true);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
