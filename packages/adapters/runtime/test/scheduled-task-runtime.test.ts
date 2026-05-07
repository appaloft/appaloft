import { describe, expect, test } from "bun:test";
import { type AppSpan, type ExecutionContext } from "@appaloft/application";
import {
  HermeticScheduledTaskRuntimePort,
  type ScheduledTaskCommandRunner,
} from "../src/scheduled-task-runtime";

class StaticScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  constructor(private readonly result: Awaited<ReturnType<ScheduledTaskCommandRunner["run"]>>) {}

  async run(): ReturnType<ScheduledTaskCommandRunner["run"]> {
    return this.result;
  }
}

class ThrowingScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  async run(): ReturnType<ScheduledTaskCommandRunner["run"]> {
    throw new Error("failed with postgres://app:secret@db.internal/app");
  }
}

class NoopAppSpan implements AppSpan {
  addEvent(): void {}
  recordError(): void {}
  setAttribute(): void {}
  setAttributes(): void {}
  setStatus(): void {}
}

function context(): ExecutionContext {
  return {
    locale: "en",
    requestId: "req_scheduled_task_runtime_test",
    entrypoint: "system",
    t: (key) => key,
    tracer: {
      async startActiveSpan(_name, _options, callback) {
        return callback(new NoopAppSpan());
      },
    },
  };
}

describe("HermeticScheduledTaskRuntimePort", () => {
  test("[SCHED-TASK-RUNTIME-001] executes one-off task commands and returns run-scoped logs", async () => {
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner: new StaticScheduledTaskCommandRunner({
        exitCode: 0,
        stdout: "migration started\nmigration finished",
      }),
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "succeeded",
      exitCode: 0,
      startedAt: "2026-05-05T00:30:00.000Z",
      finishedAt: "2026-05-05T00:30:00.000Z",
      logs: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "migration started",
        },
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "migration finished",
        },
      ],
    });
  });

  test("[SCHED-TASK-SECRET-001] masks secret-looking task runtime output", async () => {
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner: new StaticScheduledTaskCommandRunner({
        exitCode: 1,
        stdout: "using abc123",
        stderr: "TOKEN=abc123",
      }),
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "failed",
      exitCode: 1,
      startedAt: "2026-05-05T00:30:00.000Z",
      finishedAt: "2026-05-05T00:30:00.000Z",
      logs: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "using ********",
        },
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stderr",
          message: "********",
        },
      ],
      failureSummary: "********",
    });
  });

  test("[SCHED-TASK-SECRET-001] masks secret-looking runtime errors", async () => {
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner: new ThrowingScheduledTaskCommandRunner(),
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-runtime-execution",
        error: "failed with ********",
      });
    }
  });
});
