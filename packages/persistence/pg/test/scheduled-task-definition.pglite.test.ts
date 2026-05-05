import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DeleteScheduledTaskDefinitionSpec,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  Project,
  ProjectId,
  ProjectName,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  ScheduledTaskDefinitionByIdSpec,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  UpsertScheduledTaskDefinitionSpec,
} from "@appaloft/core";

function taskFixture(input?: { id?: string; resourceId?: string; createdAt?: string }) {
  return ScheduledTaskDefinition.create({
    id: ScheduledTaskId.rehydrate(input?.id ?? "tsk_backup"),
    resourceId: ResourceId.rehydrate(input?.resourceId ?? "res_api"),
    schedule: ScheduledTaskScheduleExpression.create("0 1 * * *")._unsafeUnwrap(),
    timezone: ScheduledTaskTimezone.create("UTC")._unsafeUnwrap(),
    commandIntent: ScheduledTaskCommandIntent.create("bun run backup")._unsafeUnwrap(),
    timeoutSeconds: ScheduledTaskTimeoutSeconds.create(600)._unsafeUnwrap(),
    retryLimit: ScheduledTaskRetryLimit.create(2)._unsafeUnwrap(),
    concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue.forbid(),
    status: ScheduledTaskDefinitionStatusValue.enabled(),
    createdAt: CreatedAt.rehydrate(input?.createdAt ?? "2026-05-05T00:10:00.000Z"),
  })._unsafeUnwrap();
}

describe("scheduled task definition persistence", () => {
  test("[SCHED-TASK-PERSIST-001] persists task definitions and supports task read models", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-scheduled-task-definition-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
      PgScheduledTaskDefinitionRepository,
      PgScheduledTaskReadModel,
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
          requestId: "req_scheduled_task_definition_pglite_test",
          entrypoint: "system",
        }),
      );
      const createdAt = CreatedAt.rehydrate("2026-05-05T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_api"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceName.rehydrate("API"),
        kind: ResourceKindValue.rehydrate("application"),
        createdAt,
      })._unsafeUnwrap();
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const resources = new PgResourceRepository(database.db);
      const tasks = new PgScheduledTaskDefinitionRepository(database.db);
      const readModel = new PgScheduledTaskReadModel(database.db);

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resources.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

      const task = taskFixture();
      await tasks.upsert(context, task, UpsertScheduledTaskDefinitionSpec.fromTaskDefinition(task));

      const persisted = await tasks.findOne(
        context,
        ScheduledTaskDefinitionByIdSpec.create(
          ScheduledTaskId.rehydrate("tsk_backup"),
          ResourceId.rehydrate("res_api"),
        ),
      );
      expect(persisted?.toState().commandIntent.value).toBe("bun run backup");

      persisted
        ?.update({
          schedule: ScheduledTaskScheduleExpression.create("0 2 * * *")._unsafeUnwrap(),
          status: ScheduledTaskDefinitionStatusValue.disabled(),
        })
        ._unsafeUnwrap();
      if (persisted) {
        await tasks.upsert(
          context,
          persisted,
          UpsertScheduledTaskDefinitionSpec.fromTaskDefinition(persisted),
        );
      }

      const list = await readModel.list(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_api",
        status: "disabled",
        limit: 10,
      });
      const shown = await readModel.show(context, {
        taskId: "tsk_backup",
        resourceId: "res_api",
      });

      expect(list.items).toMatchObject([
        {
          taskId: "tsk_backup",
          resourceId: "res_api",
          schedule: "0 2 * * *",
          status: "disabled",
          commandIntent: "bun run backup",
        },
      ]);
      expect(shown).toMatchObject({
        taskId: "tsk_backup",
        resourceId: "res_api",
        schedule: "0 2 * * *",
        status: "disabled",
        createdAt: "2026-05-05T00:10:00.000Z",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[SCHED-TASK-PERSIST-002] deletes task definitions through the Resource-owned mutation spec", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-scheduled-task-delete-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
      PgScheduledTaskDefinitionRepository,
      PgScheduledTaskReadModel,
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
          requestId: "req_scheduled_task_delete_pglite_test",
          entrypoint: "system",
        }),
      );
      const createdAt = CreatedAt.rehydrate("2026-05-05T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_api"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceName.rehydrate("API"),
        kind: ResourceKindValue.rehydrate("application"),
        createdAt,
      })._unsafeUnwrap();
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const resources = new PgResourceRepository(database.db);
      const tasks = new PgScheduledTaskDefinitionRepository(database.db);
      const readModel = new PgScheduledTaskReadModel(database.db);
      const task = taskFixture();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resources.upsert(context, resource, UpsertResourceSpec.fromResource(resource));
      await tasks.upsert(context, task, UpsertScheduledTaskDefinitionSpec.fromTaskDefinition(task));

      await tasks.delete(
        context,
        DeleteScheduledTaskDefinitionSpec.create(
          ScheduledTaskId.rehydrate("tsk_backup"),
          ResourceId.rehydrate("res_api"),
        ),
      );

      const shown = await readModel.show(context, {
        taskId: "tsk_backup",
        resourceId: "res_api",
      });
      const list = await readModel.list(context, { resourceId: "res_api" });

      expect(shown).toBeNull();
      expect(list.items).toEqual([]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
