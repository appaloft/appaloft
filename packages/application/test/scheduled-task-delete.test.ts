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
import { FixedClock, MemoryResourceRepository } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext, toRepositoryContext } from "../src";
import { type ScheduledTaskDefinitionRepository } from "../src/ports";
import { DeleteScheduledTaskUseCase } from "../src/use-cases";

class RecordingScheduledTaskDefinitionRepository implements ScheduledTaskDefinitionRepository {
  readonly deletes: ScheduledTaskDefinitionMutationSpec[] = [];

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
    _spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    this.task = task;
  }

  async delete(
    _context: RepositoryContext,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    this.task = null;
    this.deletes.push(spec);
  }
}

function resourceFixture() {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_api"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("API"),
    slug: ResourceSlug.rehydrate("api"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    lifecycleStatus: ResourceLifecycleStatusValue.rehydrate("active"),
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

async function createHarness(input?: { task?: ScheduledTaskDefinition | null }) {
  const context = createExecutionContext({
    requestId: "req_scheduled_task_delete_test",
    entrypoint: "system",
  });
  const resourceRepository = new MemoryResourceRepository();
  const resource = resourceFixture();
  await resourceRepository.upsert(
    toRepositoryContext(context),
    resource,
    UpsertResourceSpec.fromResource(resource),
  );
  const taskRepository = new RecordingScheduledTaskDefinitionRepository(
    input?.task === undefined ? taskFixture() : input.task,
  );

  return {
    context,
    taskRepository,
    useCase: new DeleteScheduledTaskUseCase(
      taskRepository,
      resourceRepository,
      new FixedClock("2026-05-05T00:45:00.000Z"),
    ),
  };
}

describe("DeleteScheduledTaskUseCase", () => {
  test("[SCHED-TASK-DELETE-001] deletes a Resource-owned task definition", async () => {
    const { context, taskRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      taskId: "tsk_backup",
      resourceId: "res_api",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-tasks.delete/v1",
      taskId: "tsk_backup",
      resourceId: "res_api",
      status: "deleted",
      deletedAt: "2026-05-05T00:45:00.000Z",
    });
    expect(taskRepository.deletes).toHaveLength(1);
    expect(
      taskRepository.deletes[0]?.accept({
        visitUpsertScheduledTaskDefinition: () => "unexpected",
        visitDeleteScheduledTaskDefinition: (spec) => spec.taskId.value,
      }),
    ).toBe("tsk_backup");
  });

  test("[SCHED-TASK-DELETE-002] rejects Resource context mismatch before deleting", async () => {
    const { context, taskRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      taskId: "tsk_backup",
      resourceId: "res_other",
    });

    expect(result.isErr()).toBe(true);
    expect(taskRepository.deletes).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("resource_context_mismatch");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-delete-admission",
        taskId: "tsk_backup",
        resourceId: "res_other",
      });
    }
  });
});
