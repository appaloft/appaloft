import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  ArchivedAt,
  ConfigKey,
  ConfigValueText,
  CreatedAt,
  DeletedAt,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  Project,
  ProjectByIdSpec,
  ProjectId,
  ProjectName,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";

describe("project delete persistence", () => {
  test("[PROJ-LIFE-DELETE-001][PROJ-LIFE-DELETE-CHECK-002][PROJ-LIFE-DELETE-CHECK-003] tombstones projects and reads project blockers", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-project-delete-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectDeletionBlockerReader,
      PgProjectReadModel,
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
          requestId: "req_project_delete_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const readModel = new PgProjectReadModel(database.db);
      const blockerReader = new PgProjectDeletionBlockerReader(database.db);

      const blockedProject = Project.create({
        id: ProjectId.rehydrate("prj_blocked"),
        name: ProjectName.rehydrate("Blocked"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      blockedProject.archive({ archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:10.000Z") });
      await projects.upsert(context, blockedProject, UpsertProjectSpec.fromProject(blockedProject));

      const activeProject = Project.create({
        id: ProjectId.rehydrate("prj_active"),
        name: ProjectName.rehydrate("Active"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })._unsafeUnwrap();
      await projects.upsert(context, activeProject, UpsertProjectSpec.fromProject(activeProject));

      const emptyEnvironment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate("env_empty"),
        projectId: ProjectId.rehydrate("prj_blocked"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      await environments.upsert(
        context,
        emptyEnvironment,
        UpsertEnvironmentSpec.fromEnvironment(emptyEnvironment),
      );

      const configuredEnvironment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate("env_configured"),
        projectId: ProjectId.rehydrate("prj_blocked"),
        name: EnvironmentName.rehydrate("Configured"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      configuredEnvironment
        .setVariable({
          key: ConfigKey.rehydrate("APP_PORT"),
          value: ConfigValueText.rehydrate("3000"),
          kind: VariableKindValue.rehydrate("plain-config"),
          exposure: VariableExposureValue.rehydrate("runtime"),
          updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
        })
        ._unsafeUnwrap();
      await environments.upsert(
        context,
        configuredEnvironment,
        UpsertEnvironmentSpec.fromEnvironment(configuredEnvironment),
      );

      const autoArchiveCandidates = await blockerReader.findEmptyEnvironmentArchiveCandidates(
        context,
        { projectId: "prj_blocked" },
      );
      expect(autoArchiveCandidates.isOk()).toBe(true);
      expect(autoArchiveCandidates._unsafeUnwrap()).toEqual([
        {
          environmentId: "env_empty",
          lifecycleStatus: "active",
        },
      ]);

      const blockers = await blockerReader.findBlockers(context, { projectId: "prj_blocked" });
      expect(blockers.isOk()).toBe(true);
      expect(blockers._unsafeUnwrap()).toContainEqual({
        kind: "environment",
        relatedEntityId: "env_configured",
        relatedEntityType: "environment",
        count: 1,
      });

      const deletableProject = Project.create({
        id: ProjectId.rehydrate("prj_deletable"),
        name: ProjectName.rehydrate("Deletable"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      deletableProject.archive({ archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:10.000Z") });
      deletableProject.delete({ deletedAt: DeletedAt.rehydrate("2026-01-01T00:00:20.000Z") });
      await projects.upsert(
        context,
        deletableProject,
        UpsertProjectSpec.fromProject(deletableProject),
      );

      const persisted = await projects.findOne(
        context,
        ProjectByIdSpec.create(ProjectId.rehydrate("prj_deletable")),
      );
      expect(persisted?.toState().lifecycleStatus.value).toBe("deleted");
      expect(persisted?.toState().deletedAt?.value).toBe("2026-01-01T00:00:20.000Z");

      const activeProjectIds = (await readModel.list(context, { lifecycleStatus: "active" })).map(
        (project) => project.id,
      );
      const archivedProjectIds = (
        await readModel.list(context, { lifecycleStatus: "archived" })
      ).map((project) => project.id);
      const allProjectIds = (await readModel.list(context, { lifecycleStatus: "all" }))
        .map((project) => project.id)
        .sort();

      expect(activeProjectIds).toEqual(["prj_active"]);
      expect(archivedProjectIds).toEqual(["prj_blocked"]);
      expect(allProjectIds).toEqual(["prj_active", "prj_blocked"]);

      await expect(
        readModel.findOne(context, ProjectByIdSpec.create(ProjectId.rehydrate("prj_deletable"))),
      ).resolves.toBeNull();
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
