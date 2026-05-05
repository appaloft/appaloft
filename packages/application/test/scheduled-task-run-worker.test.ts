import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ok,
  ResourceId,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  type ScheduledTaskDefinitionMutationSpec,
  type ScheduledTaskDefinitionSelectionSpec,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskRunAttempt,
  type ScheduledTaskRunAttemptMutationSpec,
  type ScheduledTaskRunAttemptSelectionSpec,
  ScheduledTaskRunId,
  ScheduledTaskRunTriggerKindValue,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
} from "@appaloft/core";
import { FixedClock, SequenceIdGenerator } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src";
import {
  type ScheduledTaskDefinitionRepository,
  type ScheduledTaskRunAttemptRepository,
  type ScheduledTaskRunLogRecord,
  type ScheduledTaskRunLogRecorder,
  type ScheduledTaskRuntimeExecutionRequest,
  type ScheduledTaskRuntimeExecutionResult,
  type ScheduledTaskRuntimePort,
} from "../src/ports";
import { ScheduledTaskRunWorker } from "../src/use-cases";

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

class MemoryScheduledTaskRunAttemptRepository implements ScheduledTaskRunAttemptRepository {
  readonly states: Array<ReturnType<ScheduledTaskRunAttempt["toState"]>> = [];

  constructor(private readonly run: ScheduledTaskRunAttempt | null) {}

  async findOne(
    _context: RepositoryContext,
    spec: ScheduledTaskRunAttemptSelectionSpec,
  ): Promise<ScheduledTaskRunAttempt | null> {
    return spec.accept({
      visitScheduledTaskRunAttemptById: (selection) => {
        if (!this.run) {
          return null;
        }
        if (!this.run.id.equals(selection.runId)) {
          return null;
        }
        if (selection.taskId && !this.run.belongsToTask(selection.taskId)) {
          return null;
        }
        if (selection.resourceId && !this.run.belongsToResource(selection.resourceId)) {
          return null;
        }
        return this.run;
      },
    });
  }

  async upsert(
    _context: RepositoryContext,
    runAttempt: ScheduledTaskRunAttempt,
    _spec: ScheduledTaskRunAttemptMutationSpec,
  ): Promise<void> {
    this.states.push(runAttempt.toState());
  }
}

class RecordingScheduledTaskRuntimePort implements ScheduledTaskRuntimePort {
  readonly requests: ScheduledTaskRuntimeExecutionRequest[] = [];

  constructor(private readonly result: ScheduledTaskRuntimeExecutionResult) {}

  async execute(
    _context: Parameters<ScheduledTaskRuntimePort["execute"]>[0],
    request: ScheduledTaskRuntimeExecutionRequest,
  ): ReturnType<ScheduledTaskRuntimePort["execute"]> {
    this.requests.push(request);
    return ok(this.result);
  }
}

class RecordingScheduledTaskRunLogRecorder implements ScheduledTaskRunLogRecorder {
  readonly records: ScheduledTaskRunLogRecord[] = [];

  async recordMany(
    _context: RepositoryContext,
    records: ScheduledTaskRunLogRecord[],
  ): ReturnType<ScheduledTaskRunLogRecorder["recordMany"]> {
    this.records.push(...records);
    return Promise.resolve(ok({ recorded: records.length }));
  }
}

function taskFixture(): ScheduledTaskDefinition {
  return ScheduledTaskDefinition.create({
    id: ScheduledTaskId.rehydrate("tsk_daily_migration"),
    resourceId: ResourceId.rehydrate("res_api"),
    schedule: ScheduledTaskScheduleExpression.rehydrate("0 1 * * *"),
    timezone: ScheduledTaskTimezone.rehydrate("UTC"),
    commandIntent: ScheduledTaskCommandIntent.rehydrate("bun run migrate"),
    timeoutSeconds: ScheduledTaskTimeoutSeconds.rehydrate(600),
    retryLimit: ScheduledTaskRetryLimit.rehydrate(2),
    concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue.forbid(),
    status: ScheduledTaskDefinitionStatusValue.enabled(),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function runFixture(): ScheduledTaskRunAttempt {
  return ScheduledTaskRunAttempt.create({
    id: ScheduledTaskRunId.rehydrate("str_manual"),
    taskId: ScheduledTaskId.rehydrate("tsk_daily_migration"),
    resourceId: ResourceId.rehydrate("res_api"),
    triggerKind: ScheduledTaskRunTriggerKindValue.manual(),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:10:00.000Z"),
  })._unsafeUnwrap();
}

describe("ScheduledTaskRunWorker", () => {
  test("[SCHED-TASK-WORKER-001] executes accepted runs and persists terminal run/log state", async () => {
    const context = createExecutionContext({
      requestId: "req_scheduled_task_run_worker_test",
      entrypoint: "system",
    });
    const runs = new MemoryScheduledTaskRunAttemptRepository(runFixture());
    const runtime = new RecordingScheduledTaskRuntimePort({
      status: "succeeded",
      exitCode: 0,
      startedAt: "2026-05-05T00:20:00.000Z",
      finishedAt: "2026-05-05T00:20:05.000Z",
      logs: [
        {
          timestamp: "2026-05-05T00:20:01.000Z",
          stream: "stdout",
          message: "migration complete",
        },
      ],
    });
    const logs = new RecordingScheduledTaskRunLogRecorder();
    const worker = new ScheduledTaskRunWorker(
      runs,
      new StaticScheduledTaskDefinitionRepository(taskFixture()),
      runtime,
      logs,
      new SequenceIdGenerator(),
      new FixedClock("2026-05-05T00:20:00.000Z"),
    );

    const result = await worker.run(context, {
      runId: "str_manual",
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
    });

    expect(result.isOk()).toBe(true);
    expect(runtime.requests).toEqual([
      {
        runId: "str_manual",
        taskId: "tsk_daily_migration",
        resourceId: "res_api",
        commandIntent: "bun run migrate",
        timeoutSeconds: 600,
      },
    ]);
    expect(runs.states.map((state) => state.status.value)).toEqual(["running", "succeeded"]);
    expect(logs.records).toEqual([
      {
        id: "stlog_0001",
        runId: "str_manual",
        taskId: "tsk_daily_migration",
        resourceId: "res_api",
        timestamp: "2026-05-05T00:20:01.000Z",
        stream: "stdout",
        message: "migration complete",
      },
    ]);
    expect(result._unsafeUnwrap()).toMatchObject({
      logsRecorded: 1,
      run: {
        runId: "str_manual",
        status: "succeeded",
        exitCode: 0,
        startedAt: "2026-05-05T00:20:00.000Z",
        finishedAt: "2026-05-05T00:20:05.000Z",
      },
    });
  });
});
