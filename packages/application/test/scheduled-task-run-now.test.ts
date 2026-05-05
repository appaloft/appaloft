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
  type ScheduledTaskRunAttempt,
  type ScheduledTaskRunAttemptMutationSpec,
  type ScheduledTaskRunAttemptSelectionSpec,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  UpsertResourceSpec,
} from "@appaloft/core";
import { FixedClock, MemoryResourceRepository, SequenceIdGenerator } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext, toRepositoryContext } from "../src";
import {
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskRunAttemptRepository,
} from "../src/ports";
import { RunScheduledTaskNowUseCase, ScheduledTaskRunAdmissionService } from "../src/use-cases";

class StaticScheduledTaskDefinitionRepository implements ScheduledTaskDefinitionRepository {
  constructor(private readonly task: ScheduledTaskDefinition | null) {}

  async findOne(
    _context: RepositoryContext,
    spec: ScheduledTaskDefinitionSelectionSpec,
  ): Promise<ScheduledTaskDefinition | null> {
    return spec.accept({
      visitScheduledTaskDefinitionById: (selection) => {
        if (!this.task) {
          return null;
        }

        if (!this.task.id.equals(selection.taskId)) {
          return null;
        }

        if (selection.resourceId && !this.task.belongsToResource(selection.resourceId)) {
          return null;
        }

        return this.task;
      },
    });
  }

  async upsert(
    _context: RepositoryContext,
    _task: ScheduledTaskDefinition,
    _spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {}

  async delete(
    _context: RepositoryContext,
    _spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {}
}

class RecordingScheduledTaskRunAttemptRepository implements ScheduledTaskRunAttemptRepository {
  readonly records: ScheduledTaskRunAttempt[] = [];
  readonly specs: ScheduledTaskRunAttemptMutationSpec[] = [];

  async findOne(
    _context: RepositoryContext,
    spec: ScheduledTaskRunAttemptSelectionSpec,
  ): Promise<ScheduledTaskRunAttempt | null> {
    return spec.accept({
      visitScheduledTaskRunAttemptById: (selection) =>
        this.records.find((run) => {
          if (!run.id.equals(selection.runId)) {
            return false;
          }
          if (selection.taskId && !run.belongsToTask(selection.taskId)) {
            return false;
          }
          if (selection.resourceId && !run.belongsToResource(selection.resourceId)) {
            return false;
          }
          return true;
        }) ?? null,
    });
  }

  async upsert(
    _context: RepositoryContext,
    runAttempt: ScheduledTaskRunAttempt,
    spec: ScheduledTaskRunAttemptMutationSpec,
  ): Promise<void> {
    this.records.push(runAttempt);
    this.specs.push(spec);
  }
}

function resourceFixture(input?: {
  id?: string;
  lifecycleStatus?: "active" | "archived" | "deleted";
}): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate(input?.id ?? "res_api"),
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

function scheduledTaskFixture(input?: {
  taskId?: string;
  resourceId?: string;
  status?: "enabled" | "disabled";
}): ScheduledTaskDefinition {
  return ScheduledTaskDefinition.create({
    id: ScheduledTaskId.rehydrate(input?.taskId ?? "tsk_daily_migration"),
    resourceId: ResourceId.rehydrate(input?.resourceId ?? "res_api"),
    schedule: ScheduledTaskScheduleExpression.rehydrate("0 1 * * *"),
    timezone: ScheduledTaskTimezone.rehydrate("UTC"),
    commandIntent: ScheduledTaskCommandIntent.rehydrate("bun run migrate"),
    timeoutSeconds: ScheduledTaskTimeoutSeconds.rehydrate(600),
    retryLimit: ScheduledTaskRetryLimit.rehydrate(2),
    concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue.forbid(),
    status:
      input?.status === "disabled"
        ? ScheduledTaskDefinitionStatusValue.disabled()
        : ScheduledTaskDefinitionStatusValue.enabled(),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
  })._unsafeUnwrap();
}

async function createHarness(input?: {
  task?: ScheduledTaskDefinition | null;
  resource?: Resource;
}) {
  const context = createExecutionContext({
    requestId: "req_scheduled_task_run_now_test",
    entrypoint: "system",
  });
  const resourceRepository = new MemoryResourceRepository();
  const resource = input?.resource ?? resourceFixture();
  await resourceRepository.upsert(
    toRepositoryContext(context),
    resource,
    UpsertResourceSpec.fromResource(resource),
  );
  const runAttemptRepository = new RecordingScheduledTaskRunAttemptRepository();

  return {
    context,
    runAttemptRepository,
    useCase: new RunScheduledTaskNowUseCase(
      new ScheduledTaskRunAdmissionService(
        new StaticScheduledTaskDefinitionRepository(input?.task ?? scheduledTaskFixture()),
        runAttemptRepository,
        resourceRepository,
        new SequenceIdGenerator(),
        new FixedClock("2026-05-05T00:10:00.000Z"),
      ),
    ),
  };
}

describe("RunScheduledTaskNowUseCase", () => {
  test("[SCHED-TASK-RUN-001] accepts run-now without executing the task synchronously", async () => {
    const { context, runAttemptRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "scheduled-tasks.run-now/v1",
      run: {
        runId: "str_0001",
        taskId: "tsk_daily_migration",
        resourceId: "res_api",
        triggerKind: "manual",
        status: "accepted",
        createdAt: "2026-05-05T00:10:00.000Z",
      },
    });
    expect(result._unsafeUnwrap().run).not.toHaveProperty("startedAt");
    expect(result._unsafeUnwrap().run).not.toHaveProperty("finishedAt");
    expect(runAttemptRepository.records).toHaveLength(1);
    expect(runAttemptRepository.records[0]?.toState().status.value).toBe("accepted");
  });

  test("[SCHED-TASK-RUN-002] rejects archived Resources before runtime execution", async () => {
    const { context, runAttemptRepository, useCase } = await createHarness({
      resource: resourceFixture({ lifecycleStatus: "archived" }),
    });

    const result = await useCase.execute(context, {
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
    });

    expect(result.isErr()).toBe(true);
    expect(runAttemptRepository.records).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("resource_archived");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-run-admission",
        resourceId: "res_api",
        taskId: "tsk_daily_migration",
        lifecycleStatus: "archived",
      });
    }
  });

  test("[SCHED-TASK-RUN-001] rejects disabled task definitions before recording a run", async () => {
    const { context, runAttemptRepository, useCase } = await createHarness({
      task: scheduledTaskFixture({ status: "disabled" }),
    });

    const result = await useCase.execute(context, {
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
    });

    expect(result.isErr()).toBe(true);
    expect(runAttemptRepository.records).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("conflict");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-run-admission",
        taskId: "tsk_daily_migration",
        resourceId: "res_api",
        status: "disabled",
      });
    }
  });
});
