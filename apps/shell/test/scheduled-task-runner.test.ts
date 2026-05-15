import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProcessAttemptDeliveryCandidateFilter,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptRecord,
  type ProcessAttemptRetryCandidateFilter,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerationInput,
  type ProcessAttemptRetryGenerationResult,
  type ProcessAttemptRetryGenerator,
  type RepositoryContext,
  type ScheduledTaskRunWorker,
  type ScheduledTaskScheduler,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

import { createScheduledTaskRunner } from "../src/scheduled-task-runner";

class CapturingLogger implements AppLogger {
  readonly messages: string[] = [];

  debug(message: string): void {
    this.messages.push(message);
  }

  info(message: string): void {
    this.messages.push(message);
  }

  warn(message: string): void {
    this.messages.push(message);
  }

  error(message: string): void {
    this.messages.push(message);
  }
}

class FixedExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: "req_scheduled_task_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingScheduledTaskScheduler implements Pick<ScheduledTaskScheduler, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    options: Parameters<ScheduledTaskScheduler["run"]>[1];
  }> = [];

  async run(
    context: ExecutionContext,
    options: Parameters<ScheduledTaskScheduler["run"]>[1],
  ): ReturnType<ScheduledTaskScheduler["run"]> {
    this.calls.push({ context, options });
    return ok({
      scanned: 1,
      dispatched: [
        {
          taskId: "tsk_daily",
          resourceId: "res_api",
          scheduledFor: "2026-05-05T01:00:00.000Z",
          run: {
            runId: "str_scheduled",
            taskId: "tsk_daily",
            resourceId: "res_api",
            triggerKind: "scheduled",
            status: "accepted",
            createdAt: "2026-05-05T01:00:00.000Z",
          },
        },
      ],
      failed: [],
    });
  }
}

class CapturingScheduledTaskRunWorker implements Pick<ScheduledTaskRunWorker, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    input: Parameters<ScheduledTaskRunWorker["run"]>[1];
  }> = [];

  async run(
    context: ExecutionContext,
    input: Parameters<ScheduledTaskRunWorker["run"]>[1],
  ): ReturnType<ScheduledTaskRunWorker["run"]> {
    this.calls.push({ context, input });
    return ok({
      logsRecorded: 0,
      run: {
        runId: input.runId,
        taskId: input.taskId ?? "tsk_daily",
        resourceId: input.resourceId ?? "res_api",
        triggerKind: "scheduled",
        status: "succeeded",
        createdAt: "2026-05-05T01:00:00.000Z",
        startedAt: "2026-05-05T01:00:01.000Z",
        finishedAt: "2026-05-05T01:00:02.000Z",
        exitCode: 0,
      },
    });
  }
}

class CapturingProcessAttemptDeliveryCandidateReader
  implements Pick<ProcessAttemptDeliveryCandidateReader, "listDueDeliveryCandidates">
{
  readonly calls: Array<{
    context: RepositoryContext;
    filter: ProcessAttemptDeliveryCandidateFilter;
  }> = [];

  constructor(private readonly attempts: ProcessAttemptRecord[]) {}

  async listDueDeliveryCandidates(
    context: RepositoryContext,
    filter: ProcessAttemptDeliveryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]> {
    this.calls.push({ context, filter });
    return this.attempts;
  }
}

class CapturingProcessAttemptRetryCandidateReader
  implements Pick<ProcessAttemptRetryCandidateReader, "listDueRetries">
{
  readonly calls: Array<{
    context: RepositoryContext;
    filter: ProcessAttemptRetryCandidateFilter;
  }> = [];

  constructor(private readonly attempts: ProcessAttemptRecord[]) {}

  async listDueRetries(
    context: RepositoryContext,
    filter: ProcessAttemptRetryCandidateFilter,
  ): Promise<ProcessAttemptRecord[]> {
    this.calls.push({ context, filter });
    return this.attempts;
  }
}

class CapturingProcessAttemptRetryGenerator
  implements Pick<ProcessAttemptRetryGenerator, "generateDueRetry">
{
  readonly calls: Array<{
    context: RepositoryContext;
    input: ProcessAttemptRetryGenerationInput;
  }> = [];

  constructor(private readonly attempts: ProcessAttemptRecord[]) {}

  async generateDueRetry(
    context: RepositoryContext,
    input: ProcessAttemptRetryGenerationInput,
  ): ReturnType<ProcessAttemptRetryGenerator["generateDueRetry"]> {
    this.calls.push({ context, input });
    const retryAttempt = this.attempts.shift();
    if (!retryAttempt) {
      const result: ProcessAttemptRetryGenerationResult = {
        status: "not-found",
        sourceAttemptId: input.sourceAttemptId,
      };
      return ok(result);
    }

    const result: ProcessAttemptRetryGenerationResult = {
      status: "generated",
      sourceAttempt: scheduledTaskProcessAttempt({
        id: input.sourceAttemptId,
        status: "retry-scheduled",
        retriable: false,
        nextActions: ["no-action"],
      }),
      retryAttempt,
    };
    return ok(result);
  }
}

function scheduledTaskProcessAttempt(
  overrides: Partial<ProcessAttemptRecord> = {},
): ProcessAttemptRecord {
  return {
    id: "wrk_scheduled_task_run",
    kind: "runtime-maintenance",
    status: "pending",
    operationKey: "scheduled-tasks.run-now",
    phase: "manual-retry",
    step: "queued",
    resourceId: "res_api",
    startedAt: "2026-05-05T01:00:00.000Z",
    updatedAt: "2026-05-05T01:00:00.000Z",
    nextActions: ["no-action"],
    safeDetails: {
      runId: "str_retry",
      taskId: "tsk_daily",
      resourceId: "res_api",
    },
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ScheduledTaskRunner", () => {
  test("[SCHED-TASK-RUNNER-001] does not start when disabled", async () => {
    const scheduler = new CapturingScheduledTaskScheduler();
    const worker = new CapturingScheduledTaskRunWorker();
    const runner = createScheduledTaskRunner({
      config: {
        enabled: false,
        intervalSeconds: 1,
        batchSize: 5,
      },
      scheduler,
      worker,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);

    expect(scheduler.calls).toHaveLength(0);
    expect(worker.calls).toHaveLength(0);
    runner.stop();
  });

  test("[SCHED-TASK-RUNNER-001] starts from shell runner and drains admitted runs", async () => {
    const scheduler = new CapturingScheduledTaskScheduler();
    const worker = new CapturingScheduledTaskRunWorker();
    const runner = createScheduledTaskRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 7,
      },
      scheduler,
      worker,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(scheduler.calls).toHaveLength(1);
    const schedulerCall = scheduler.calls[0];
    expect(schedulerCall).toBeDefined();
    if (!schedulerCall) {
      throw new Error("expected scheduled task scheduler call");
    }

    expect(schedulerCall.context).toMatchObject({
      entrypoint: "system",
      actor: {
        kind: "system",
        id: "scheduled-task-runner",
      },
    });
    expect(schedulerCall.options).toEqual({ limit: 7 });
    expect(worker.calls).toEqual([
      {
        context: schedulerCall.context,
        input: {
          runId: "str_scheduled",
          taskId: "tsk_daily",
          resourceId: "res_api",
        },
      },
    ]);
  });

  test("[SCHED-TASK-RUNNER-001] [PROC-DELIVERY-002] wires due durable process attempts into scheduled task worker", async () => {
    const scheduler = new CapturingScheduledTaskScheduler();
    const processAttemptDeliveryCandidateReader =
      new CapturingProcessAttemptDeliveryCandidateReader([scheduledTaskProcessAttempt()]);
    const worker = new CapturingScheduledTaskRunWorker();
    const runner = createScheduledTaskRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 7,
      },
      scheduler,
      worker,
      processAttemptDeliveryCandidateReader,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(processAttemptDeliveryCandidateReader.calls).toHaveLength(2);
    expect(
      processAttemptDeliveryCandidateReader.calls.map((call) => call.filter.operationKey),
    ).toEqual(["scheduled-tasks.run-now", "scheduled-task-runs.run-due"]);
    for (const candidateCall of processAttemptDeliveryCandidateReader.calls) {
      expect(candidateCall.filter).toMatchObject({
        kind: "runtime-maintenance",
        limit: 7,
      });
    }
    const schedulerCall = scheduler.calls[0];
    expect(schedulerCall).toBeDefined();
    if (!schedulerCall) {
      throw new Error("expected scheduled task scheduler call");
    }
    expect(worker.calls).toEqual([
      {
        context: schedulerCall.context,
        input: {
          runId: "str_scheduled",
          taskId: "tsk_daily",
          resourceId: "res_api",
        },
      },
      {
        context: schedulerCall.context,
        input: {
          runId: "str_retry",
          taskId: "tsk_daily",
          resourceId: "res_api",
          processAttemptId: "wrk_scheduled_task_run",
          workerId: "scheduled-task-runner",
        },
      },
    ]);
  });

  test("[SCHED-TASK-RUNNER-001] [PROC-DELIVERY-002] lets durable delivery own scheduler-recorded runs", async () => {
    const scheduler = new CapturingScheduledTaskScheduler();
    const processAttemptDeliveryCandidateReader =
      new CapturingProcessAttemptDeliveryCandidateReader([
        scheduledTaskProcessAttempt({
          id: "wrk_scheduled_delivery",
          operationKey: "scheduled-task-runs.run-due",
          safeDetails: {
            runId: "str_scheduled",
            taskId: "tsk_daily",
            resourceId: "res_api",
          },
        }),
      ]);
    const worker = new CapturingScheduledTaskRunWorker();
    const runner = createScheduledTaskRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 7,
      },
      scheduler,
      worker,
      processAttemptDeliveryCandidateReader,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    const schedulerCall = scheduler.calls[0];
    expect(schedulerCall).toBeDefined();
    if (!schedulerCall) {
      throw new Error("expected scheduled task scheduler call");
    }
    expect(worker.calls).toEqual([
      {
        context: schedulerCall.context,
        input: {
          runId: "str_scheduled",
          taskId: "tsk_daily",
          resourceId: "res_api",
          processAttemptId: "wrk_scheduled_delivery",
          workerId: "scheduled-task-runner",
        },
      },
    ]);
  });

  test("[SCHED-TASK-RUNNER-001] [PROC-DELIVERY-011] generates due retries before durable worker handoff", async () => {
    const scheduler = new CapturingScheduledTaskScheduler();
    const processAttemptRetryCandidateReader = new CapturingProcessAttemptRetryCandidateReader([
      scheduledTaskProcessAttempt({
        id: "wrk_retry_source",
        status: "retry-scheduled",
        retriable: true,
        nextEligibleAt: "2026-05-05T01:05:00.000Z",
      }),
    ]);
    const processAttemptRetryGenerator = new CapturingProcessAttemptRetryGenerator([
      scheduledTaskProcessAttempt({
        id: "wrk_retry_generated",
        phase: "scheduled-task-run-retry",
        step: "queued",
      }),
    ]);
    const processAttemptDeliveryCandidateReader =
      new CapturingProcessAttemptDeliveryCandidateReader([
        scheduledTaskProcessAttempt({
          id: "wrk_retry_generated",
          phase: "scheduled-task-run-retry",
          step: "queued",
        }),
      ]);
    const worker = new CapturingScheduledTaskRunWorker();
    const runner = createScheduledTaskRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 7,
      },
      scheduler,
      worker,
      processAttemptRetryCandidateReader,
      processAttemptRetryGenerator,
      processAttemptDeliveryCandidateReader,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(processAttemptRetryCandidateReader.calls).toHaveLength(1);
    expect(processAttemptRetryCandidateReader.calls[0]?.filter).toMatchObject({
      kind: "runtime-maintenance",
      limit: 7,
    });
    expect(processAttemptRetryGenerator.calls).toHaveLength(1);
    expect(processAttemptRetryGenerator.calls[0]?.input).toMatchObject({
      sourceAttemptId: "wrk_retry_source",
      retryAttemptId: "wrk_retry_source_retry",
      phase: "scheduled-task-run-retry",
      step: "queued",
      safeDetails: {
        generatedBy: "scheduled-task-runner",
      },
    });
    const schedulerCall = scheduler.calls[0];
    expect(schedulerCall).toBeDefined();
    if (!schedulerCall) {
      throw new Error("expected scheduled task scheduler call");
    }
    expect(worker.calls).toEqual([
      {
        context: schedulerCall.context,
        input: {
          runId: "str_scheduled",
          taskId: "tsk_daily",
          resourceId: "res_api",
        },
      },
      {
        context: schedulerCall.context,
        input: {
          runId: "str_retry",
          taskId: "tsk_daily",
          resourceId: "res_api",
          processAttemptId: "wrk_retry_generated",
          workerId: "scheduled-task-runner",
        },
      },
    ]);
  });
});
