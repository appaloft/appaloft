import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
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
});
