import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  EnvironmentId,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceLifecycleStatusValue,
  ResourceName,
  ResourceSlug,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  type ScheduledTaskDefinitionMutationSpec,
  type ScheduledTaskDefinitionSelectionSpec,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  UpsertResourceSpec,
} from "@appaloft/core";
import { MemoryResourceRepository } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext, toRepositoryContext } from "../src";
import { type ScheduledTaskDefinitionRepository } from "../src/ports";
import { ConfigureScheduledTaskUseCase } from "../src/use-cases";

class RecordingScheduledTaskDefinitionRepository implements ScheduledTaskDefinitionRepository {
  readonly upserts: ScheduledTaskDefinition[] = [];
  readonly specs: ScheduledTaskDefinitionMutationSpec[] = [];

  constructor(private task: ScheduledTaskDefinition | null) {}

  async findOne(
    _context: RepositoryContext,
    spec: ScheduledTaskDefinitionSelectionSpec,
  ): Promise<ScheduledTaskDefinition | null> {
    return spec.accept({
      visitScheduledTaskDefinitionById: (selection) => {
        if (!this.task?.id.equals(selection.taskId)) {
          return null;
        }

        return this.task;
      },
    });
  }

  async upsert(
    _context: RepositoryContext,
    task: ScheduledTaskDefinition,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    this.task = task;
    this.upserts.push(task);
    this.specs.push(spec);
  }

  async delete(
    _context: RepositoryContext,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    this.task = null;
    this.specs.push(spec);
  }
}

function resourceFixture(input?: { lifecycleStatus?: "active" | "archived" | "deleted" }) {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_api"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("API"),
    slug: ResourceSlug.rehydrate("api"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    lifecycleStatus: ResourceLifecycleStatusValue.rehydrate(input?.lifecycleStatus ?? "active"),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
  });
}

function taskFixture() {
  return ScheduledTaskDefinition.create({
    id: ScheduledTaskId.rehydrate("tsk_backup"),
    resourceId: ResourceId.rehydrate("res_api"),
    schedule: ScheduledTaskScheduleExpression.create("0 1 * * *")._unsafeUnwrap(),
    timezone: ScheduledTaskTimezone.create("UTC")._unsafeUnwrap(),
    commandIntent: ScheduledTaskCommandIntent.create("bun run backup")._unsafeUnwrap(),
    timeoutSeconds: ScheduledTaskTimeoutSeconds.create(600)._unsafeUnwrap(),
    retryLimit: ScheduledTaskRetryLimit.create(2)._unsafeUnwrap(),
    concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue.forbid(),
    status: ScheduledTaskDefinitionStatusValue.enabled(),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:10:00.000Z"),
  })._unsafeUnwrap();
}

async function createHarness(input?: { resource?: Resource; task?: ScheduledTaskDefinition }) {
  const context = createExecutionContext({
    requestId: "req_scheduled_task_update_test",
    entrypoint: "system",
  });
  const resourceRepository = new MemoryResourceRepository();
  const resource = input?.resource ?? resourceFixture();
  await resourceRepository.upsert(
    toRepositoryContext(context),
    resource,
    UpsertResourceSpec.fromResource(resource),
  );
  const taskRepository = new RecordingScheduledTaskDefinitionRepository(
    input?.task ?? taskFixture(),
  );

  return {
    context,
    taskRepository,
    useCase: new ConfigureScheduledTaskUseCase(taskRepository, resourceRepository),
  };
}

describe("ConfigureScheduledTaskUseCase", () => {
  test("[SCHED-TASK-UPDATE-001] configures a Resource-owned task definition", async () => {
    const { context, taskRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      taskId: "tsk_backup",
      resourceId: "res_api",
      schedule: "0 2 * * *",
      timezone: "Asia/Shanghai",
      commandIntent: "bun run migrate",
      timeoutSeconds: 900,
      retryLimit: 0,
      status: "disabled",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "scheduled-tasks.command/v1",
      task: {
        taskId: "tsk_backup",
        resourceId: "res_api",
        schedule: "0 2 * * *",
        timezone: "Asia/Shanghai",
        commandIntent: "bun run migrate",
        timeoutSeconds: 900,
        retryLimit: 0,
        concurrencyPolicy: "forbid",
        status: "disabled",
        createdAt: "2026-05-05T00:10:00.000Z",
      },
    });
    expect(taskRepository.upserts).toHaveLength(1);
    expect(taskRepository.upserts[0]?.toState().retryLimit.value).toBe(0);
  });

  test("[SCHED-TASK-UPDATE-002] rejects archived Resources before storing updates", async () => {
    const { context, taskRepository, useCase } = await createHarness({
      resource: resourceFixture({ lifecycleStatus: "archived" }),
    });

    const result = await useCase.execute(context, {
      taskId: "tsk_backup",
      resourceId: "res_api",
      schedule: "0 2 * * *",
    });

    expect(result.isErr()).toBe(true);
    expect(taskRepository.upserts).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("resource_archived");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-update-admission",
        taskId: "tsk_backup",
        resourceId: "res_api",
        lifecycleStatus: "archived",
      });
    }
  });

  test("[SCHED-TASK-SECRET-001] rejects unsafe update command intent before storing updates", async () => {
    const { context, taskRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      taskId: "tsk_backup",
      resourceId: "res_api",
      commandIntent: "PASSWORD=secret bun run backup",
    });

    expect(result.isErr()).toBe(true);
    expect(taskRepository.upserts).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("validation_error");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-definition-admission",
        field: "commandIntent",
      });
    }
  });

  test("[SCHED-TASK-SECRET-001] masks legacy unsafe command intent in command output", async () => {
    const legacyTask = ScheduledTaskDefinition.rehydrate({
      ...taskFixture().toState(),
      commandIntent: ScheduledTaskCommandIntent.rehydrate(
        "psql postgres://app:secret@db.internal/app",
      ),
    });
    const { context, useCase } = await createHarness({ task: legacyTask });

    const result = await useCase.execute(context, {
      taskId: "tsk_backup",
      resourceId: "res_api",
      schedule: "0 3 * * *",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().task.commandIntent).toBe("psql ********");
  });
});
