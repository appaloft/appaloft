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
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
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
      visitScheduledTaskRunAttemptByScheduleSlot: (selection) => {
        if (!this.run) {
          return null;
        }
        const state = this.run.toState();
        if (!this.run.belongsToTask(selection.taskId)) {
          return null;
        }
        if (
          state.triggerKind.value !== "scheduled" ||
          state.scheduledFor?.value !== selection.scheduledFor.value
        ) {
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

class RecordingProcessAttemptClaimer implements ProcessAttemptClaimer {
  readonly claims: ProcessAttemptClaimInput[] = [];

  constructor(private readonly result: ProcessAttemptClaimResult) {}

  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): ReturnType<ProcessAttemptClaimer["claimDue"]> {
    this.claims.push(input);
    return Promise.resolve(ok(this.result));
  }
}

class RecordingProcessAttemptCompleter implements ProcessAttemptCompleter {
  readonly completions: ProcessAttemptCompletionInput[] = [];

  constructor(
    private readonly result: ProcessAttemptCompletionResult = {
      status: "completed",
      attempt: {
        id: "wrk_scheduled_task_run",
        kind: "runtime-maintenance",
        status: "succeeded",
        operationKey: "scheduled-tasks.run-now",
        updatedAt: "2026-05-05T00:20:05.000Z",
        nextActions: ["no-action"],
      },
    },
  ) {}

  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): ReturnType<ProcessAttemptCompleter["complete"]> {
    this.completions.push(input);
    return Promise.resolve(ok(this.result));
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
      timeline: [
        {
          timestamp: "2026-05-05T00:20:01.000Z",
          stream: "stdout",
          message: "migration complete",
        },
      ],
    });
    const timeline = new RecordingScheduledTaskRunLogRecorder();
    const worker = new ScheduledTaskRunWorker(
      runs,
      new StaticScheduledTaskDefinitionRepository(taskFixture()),
      runtime,
      timeline,
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
    expect(timeline.records).toEqual([
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

  test("[SCHED-TASK-WORKER-001] [PROC-DELIVERY-002] [PROC-DELIVERY-004] claims and completes durable process attempts when provided", async () => {
    const context = createExecutionContext({
      requestId: "req_scheduled_task_run_worker_test",
      entrypoint: "system",
    });
    const runs = new MemoryScheduledTaskRunAttemptRepository(runFixture());
    const runtime = new RecordingScheduledTaskRuntimePort({
      status: "failed",
      exitCode: 1,
      startedAt: "2026-05-05T00:20:00.000Z",
      finishedAt: "2026-05-05T00:20:05.000Z",
      failureSummary: "temporary network timeout",
      timeline: [],
    });
    const timeline = new RecordingScheduledTaskRunLogRecorder();
    const claimer = new RecordingProcessAttemptClaimer({
      status: "claimed",
      attempt: {
        id: "wrk_scheduled_task_run",
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "scheduled-tasks.run-now",
        updatedAt: "2026-05-05T00:20:00.000Z",
        nextActions: ["no-action"],
      },
    });
    const completer = new RecordingProcessAttemptCompleter();
    const worker = new ScheduledTaskRunWorker(
      runs,
      new StaticScheduledTaskDefinitionRepository(taskFixture()),
      runtime,
      timeline,
      new SequenceIdGenerator(),
      new FixedClock("2026-05-05T00:20:00.000Z"),
      claimer,
      completer,
    );

    const result = await worker.run(context, {
      runId: "str_manual",
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      processAttemptId: "wrk_scheduled_task_run",
      workerId: "worker_scheduled_task",
    });

    expect(result.isOk()).toBe(true);
    expect(claimer.claims).toEqual([
      {
        attemptId: "wrk_scheduled_task_run",
        workerId: "worker_scheduled_task",
        claimedAt: "2026-05-05T00:20:00.000Z",
        safeDetails: {
          runId: "str_manual",
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
        },
      },
    ]);
    expect(completer.completions).toEqual([
      {
        attemptId: "wrk_scheduled_task_run",
        status: "retry-scheduled",
        completedAt: "2026-05-05T00:20:05.000Z",
        phase: "scheduled-task-run",
        step: "runtime-execution",
        errorCode: "scheduled_task_run_failed",
        errorCategory: "async-processing",
        retriable: true,
        nextEligibleAt: "2026-05-05T00:20:00.000Z",
        nextActions: ["retry", "manual-review"],
        safeDetails: {
          runId: "str_manual",
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
          exitCode: 1,
        },
      },
    ]);
    expect(result._unsafeUnwrap()).toMatchObject({
      run: {
        status: "failed",
        failureSummary: "temporary network timeout",
      },
    });
  });

  test("[SCHED-TASK-WORKER-001] [PROC-DELIVERY-002] does not execute runtime work when durable claim is refused", async () => {
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
      timeline: [],
    });
    const claimer = new RecordingProcessAttemptClaimer({
      status: "already-claimed",
      attempt: {
        id: "wrk_scheduled_task_run",
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "scheduled-tasks.run-now",
        updatedAt: "2026-05-05T00:19:00.000Z",
        nextActions: ["no-action"],
      },
    });
    const worker = new ScheduledTaskRunWorker(
      runs,
      new StaticScheduledTaskDefinitionRepository(taskFixture()),
      runtime,
      new RecordingScheduledTaskRunLogRecorder(),
      new SequenceIdGenerator(),
      new FixedClock("2026-05-05T00:20:00.000Z"),
      claimer,
      new RecordingProcessAttemptCompleter(),
    );

    const result = await worker.run(context, {
      runId: "str_manual",
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      processAttemptId: "wrk_scheduled_task_run",
      workerId: "worker_scheduled_task",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "scheduled-task-run-worker",
        runId: "str_manual",
        processAttemptId: "wrk_scheduled_task_run",
        claimStatus: "already-claimed",
      },
    });
    expect(runtime.requests).toEqual([]);
    expect(runs.states).toEqual([]);
  });
});
