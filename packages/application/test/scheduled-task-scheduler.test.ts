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
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  FixedClock,
  MemoryResourceRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext, toRepositoryContext } from "../src";
import {
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskDueCandidate,
  type ScheduledTaskDueCandidateReader,
  type ScheduledTaskRunAttemptRepository,
} from "../src/ports";
import { ScheduledTaskRunAdmissionService, ScheduledTaskScheduler } from "../src/use-cases";

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

  async upsert(
    _context: RepositoryContext,
    runAttempt: ScheduledTaskRunAttempt,
    spec: ScheduledTaskRunAttemptMutationSpec,
  ): Promise<void> {
    this.records.push(runAttempt);
    this.specs.push(spec);
  }
}

class StaticScheduledTaskDueCandidateReader implements ScheduledTaskDueCandidateReader {
  readonly inputs: Parameters<ScheduledTaskDueCandidateReader["listDue"]>[1][] = [];

  constructor(private readonly candidates: ScheduledTaskDueCandidate[]) {}

  async listDue(
    _context: RepositoryContext,
    input: Parameters<ScheduledTaskDueCandidateReader["listDue"]>[1],
  ): Promise<ScheduledTaskDueCandidate[]> {
    this.inputs.push(input);
    return this.candidates.slice(0, input.limit);
  }
}

function resourceFixture(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_api"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("API"),
    slug: ResourceSlug.rehydrate("api"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    lifecycleStatus: ResourceLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
  });
}

function scheduledTaskFixture(input?: {
  status?: "enabled" | "disabled";
}): ScheduledTaskDefinition {
  return ScheduledTaskDefinition.create({
    id: ScheduledTaskId.rehydrate("tsk_daily_migration"),
    resourceId: ResourceId.rehydrate("res_api"),
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
  candidates?: ScheduledTaskDueCandidate[];
}) {
  const context = createExecutionContext({
    requestId: "req_scheduled_task_scheduler_test",
    entrypoint: "system",
  });
  const resourceRepository = new MemoryResourceRepository();
  await resourceRepository.upsert(
    toRepositoryContext(context),
    resourceFixture(),
    UpsertResourceSpec.fromResource(resourceFixture()),
  );
  const runAttemptRepository = new RecordingScheduledTaskRunAttemptRepository();
  const dueReader = new StaticScheduledTaskDueCandidateReader(
    input?.candidates ?? [
      {
        taskId: "tsk_daily_migration",
        resourceId: "res_api",
        scheduledFor: "2026-05-05T00:00:00.000Z",
      },
    ],
  );
  const clock = new FixedClock("2026-05-05T00:10:00.000Z");
  const admission = new ScheduledTaskRunAdmissionService(
    new StaticScheduledTaskDefinitionRepository(input?.task ?? scheduledTaskFixture()),
    runAttemptRepository,
    resourceRepository,
    new SequenceIdGenerator(),
    clock,
  );

  return {
    context,
    dueReader,
    runAttemptRepository,
    scheduler: new ScheduledTaskScheduler(dueReader, admission, clock, new NoopLogger()),
  };
}

describe("ScheduledTaskScheduler", () => {
  test("[SCHED-TASK-SCHED-001] dispatches due tasks through scheduled run admission", async () => {
    const { context, dueReader, runAttemptRepository, scheduler } = await createHarness();

    const result = await scheduler.run(context, { limit: 5 });

    expect(result.isOk()).toBe(true);
    expect(dueReader.inputs).toEqual([{ now: "2026-05-05T00:10:00.000Z", limit: 5 }]);
    expect(result._unsafeUnwrap()).toEqual({
      scanned: 1,
      dispatched: [
        {
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
          scheduledFor: "2026-05-05T00:00:00.000Z",
          run: {
            runId: "str_0001",
            taskId: "tsk_daily_migration",
            resourceId: "res_api",
            triggerKind: "scheduled",
            status: "accepted",
            createdAt: "2026-05-05T00:10:00.000Z",
          },
        },
      ],
      failed: [],
    });
    expect(runAttemptRepository.records).toHaveLength(1);
    expect(runAttemptRepository.records[0]?.toState().triggerKind.value).toBe("scheduled");
  });

  test("[SCHED-TASK-SCHED-001] records scheduler admission failures without runtime execution", async () => {
    const { context, runAttemptRepository, scheduler } = await createHarness({
      task: scheduledTaskFixture({ status: "disabled" }),
    });

    const result = await scheduler.run(context);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      scanned: 1,
      dispatched: [],
      failed: [
        {
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
          scheduledFor: "2026-05-05T00:00:00.000Z",
          errorCode: "conflict",
        },
      ],
    });
    expect(runAttemptRepository.records).toHaveLength(0);
  });
});
