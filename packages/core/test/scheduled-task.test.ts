import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  FinishedAt,
  ResourceId,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskRunAttempt,
  ScheduledTaskRunExitCode,
  ScheduledTaskRunFailureSummary,
  ScheduledTaskRunId,
  ScheduledTaskRunSkippedReasonValue,
  ScheduledTaskRunStatusValue,
  ScheduledTaskRunTriggerKindValue,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
  StartedAt,
} from "../src";

describe("ScheduledTaskDefinition", () => {
  test("[SCHED-TASK-DOMAIN-001] accepts safe scheduled task definition value objects", () => {
    const schedule = ScheduledTaskScheduleExpression.create("*/15 * * * *");
    const timezone = ScheduledTaskTimezone.create("UTC");
    const commandIntent = ScheduledTaskCommandIntent.create("bun run migrate");
    const timeoutSeconds = ScheduledTaskTimeoutSeconds.create(600);
    const retryLimit = ScheduledTaskRetryLimit.create(2);
    const concurrencyPolicy = ScheduledTaskConcurrencyPolicyValue.create("forbid");
    const status = ScheduledTaskDefinitionStatusValue.create("enabled");

    expect(schedule.isOk()).toBe(true);
    expect(timezone.isOk()).toBe(true);
    expect(commandIntent.isOk()).toBe(true);
    expect(timeoutSeconds.isOk()).toBe(true);
    expect(retryLimit.isOk()).toBe(true);
    expect(concurrencyPolicy.isOk()).toBe(true);
    expect(status.isOk()).toBe(true);

    const task = ScheduledTaskDefinition.create({
      id: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      schedule: schedule._unsafeUnwrap(),
      timezone: timezone._unsafeUnwrap(),
      commandIntent: commandIntent._unsafeUnwrap(),
      timeoutSeconds: timeoutSeconds._unsafeUnwrap(),
      retryLimit: retryLimit._unsafeUnwrap(),
      concurrencyPolicy: concurrencyPolicy._unsafeUnwrap(),
      status: status._unsafeUnwrap(),
      createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
    });

    expect(task.isOk()).toBe(true);
    const state = task._unsafeUnwrap().toState();
    expect(state.resourceId.value).toBe("res_api");
    expect(state.schedule.value).toBe("*/15 * * * *");
    expect(state.timezone.value).toBe("UTC");
    expect(state.commandIntent.value).toBe("bun run migrate");
    expect(state.timeoutSeconds.value).toBe(600);
    expect(state.retryLimit.value).toBe(2);
    expect(state.concurrencyPolicy.value).toBe("forbid");
    expect(state.status.value).toBe("enabled");
    expect(state).not.toHaveProperty("deploymentId");
    expect(task._unsafeUnwrap().belongsToResource(ResourceId.rehydrate("res_api"))).toBe(true);
    expect(task._unsafeUnwrap().usesForbidConcurrency()).toBe(true);
    expect(task._unsafeUnwrap().isEnabled()).toBe(true);
  });

  test("[SCHED-TASK-DOMAIN-002] rejects invalid schedule and unsafe command intent", () => {
    const invalidSchedule = ScheduledTaskScheduleExpression.create("every weekday");
    const outOfRangeSchedule = ScheduledTaskScheduleExpression.create("99 * * * *");
    const unsafeCommand = ScheduledTaskCommandIntent.create("TOKEN=secret bun run sync");
    const invalidTimeout = ScheduledTaskTimeoutSeconds.create(0);
    const invalidRetry = ScheduledTaskRetryLimit.create(12);
    const unsupportedConcurrency = ScheduledTaskConcurrencyPolicyValue.create("parallel");
    const unsupportedStatus = ScheduledTaskDefinitionStatusValue.create("paused");

    expect(invalidSchedule.isErr()).toBe(true);
    expect(outOfRangeSchedule.isErr()).toBe(true);
    expect(unsafeCommand.isErr()).toBe(true);
    expect(invalidTimeout.isErr()).toBe(true);
    expect(invalidRetry.isErr()).toBe(true);
    expect(unsupportedConcurrency.isErr()).toBe(true);
    expect(unsupportedStatus.isErr()).toBe(true);

    if (invalidSchedule.isErr()) {
      expect(invalidSchedule.error.code).toBe("validation_error");
      expect(invalidSchedule.error.details).toMatchObject({
        phase: "scheduled-task-definition-admission",
        field: "schedule",
      });
    }

    if (unsafeCommand.isErr()) {
      expect(unsafeCommand.error.details).toMatchObject({
        phase: "scheduled-task-definition-admission",
        field: "commandIntent",
      });
    }
  });

  test("[SCHED-TASK-DOMAIN-001] updates definition fields through value objects", () => {
    const task = ScheduledTaskDefinition.create({
      id: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      schedule: ScheduledTaskScheduleExpression.create("0 1 * * *")._unsafeUnwrap(),
      timezone: ScheduledTaskTimezone.create("UTC")._unsafeUnwrap(),
      commandIntent: ScheduledTaskCommandIntent.create("bun run migrate")._unsafeUnwrap(),
      timeoutSeconds: ScheduledTaskTimeoutSeconds.create(600)._unsafeUnwrap(),
      retryLimit: ScheduledTaskRetryLimit.create(2)._unsafeUnwrap(),
      concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue.forbid(),
      status: ScheduledTaskDefinitionStatusValue.enabled(),
      createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
    })._unsafeUnwrap();

    const updated = task.update({
      schedule: ScheduledTaskScheduleExpression.create("0 2 * * *")._unsafeUnwrap(),
      timezone: ScheduledTaskTimezone.create("Asia/Shanghai")._unsafeUnwrap(),
      commandIntent: ScheduledTaskCommandIntent.create("bun run backup")._unsafeUnwrap(),
      timeoutSeconds: ScheduledTaskTimeoutSeconds.create(900)._unsafeUnwrap(),
      retryLimit: ScheduledTaskRetryLimit.create(0)._unsafeUnwrap(),
      status: ScheduledTaskDefinitionStatusValue.disabled(),
    });

    expect(updated.isOk()).toBe(true);
    const state = task.toState();
    expect(state.schedule.value).toBe("0 2 * * *");
    expect(state.timezone.value).toBe("Asia/Shanghai");
    expect(state.commandIntent.value).toBe("bun run backup");
    expect(state.timeoutSeconds.value).toBe(900);
    expect(state.retryLimit.value).toBe(0);
    expect(state.concurrencyPolicy.value).toBe("forbid");
    expect(state.status.value).toBe("disabled");
    expect(state.createdAt.value).toBe("2026-05-05T00:00:00.000Z");
  });
});

describe("ScheduledTaskRunAttempt", () => {
  test("[SCHED-TASK-DOMAIN-003] records accepted, running, and terminal run attempt transitions", () => {
    const run = ScheduledTaskRunAttempt.create({
      id: ScheduledTaskRunId.rehydrate("str_daily_migration_1"),
      taskId: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      triggerKind: ScheduledTaskRunTriggerKindValue.manual(),
      createdAt: CreatedAt.rehydrate("2026-05-05T00:01:00.000Z"),
    })._unsafeUnwrap();

    expect(run.toState().status.value).toBe("accepted");
    expect(run.isNonTerminal()).toBe(true);
    expect(run.toState()).not.toHaveProperty("deploymentId");
    expect(run.belongsToTask(ScheduledTaskId.rehydrate("tsk_daily_migration"))).toBe(true);
    expect(run.belongsToResource(ResourceId.rehydrate("res_api"))).toBe(true);

    const started = run.start({
      startedAt: StartedAt.rehydrate("2026-05-05T00:01:05.000Z"),
    });

    expect(started.isOk()).toBe(true);
    expect(run.isRunning()).toBe(true);
    expect(run.toState().startedAt?.value).toBe("2026-05-05T00:01:05.000Z");

    const succeeded = run.markSucceeded({
      finishedAt: FinishedAt.rehydrate("2026-05-05T00:01:30.000Z"),
      exitCode: ScheduledTaskRunExitCode.rehydrate(0),
    });

    expect(succeeded.isOk()).toBe(true);
    expect(run.isTerminal()).toBe(true);
    expect(run.toState().status.value).toBe("succeeded");
    expect(run.toState().exitCode?.isSuccessful()).toBe(true);

    const failedStart = run.start({
      startedAt: StartedAt.rehydrate("2026-05-05T00:02:00.000Z"),
    });

    expect(failedStart.isErr()).toBe(true);
    if (failedStart.isErr()) {
      expect(failedStart.error.code).toBe("conflict");
      expect(failedStart.error.details).toMatchObject({
        phase: "scheduled-task-run-state-transition",
        status: "succeeded",
      });
    }

    const invalidSuccess = ScheduledTaskRunAttempt.create({
      id: ScheduledTaskRunId.rehydrate("str_daily_migration_invalid_success"),
      taskId: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      triggerKind: ScheduledTaskRunTriggerKindValue.manual(),
      createdAt: CreatedAt.rehydrate("2026-05-05T00:03:00.000Z"),
    })._unsafeUnwrap();
    invalidSuccess
      .start({
        startedAt: StartedAt.rehydrate("2026-05-05T00:03:01.000Z"),
      })
      ._unsafeUnwrap();

    const invalidSuccessResult = invalidSuccess.markSucceeded({
      finishedAt: FinishedAt.rehydrate("2026-05-05T00:03:02.000Z"),
      exitCode: ScheduledTaskRunExitCode.rehydrate(1),
    });

    expect(invalidSuccessResult.isErr()).toBe(true);
  });

  test("[SCHED-TASK-DOMAIN-003] records skipped and failed run terminal details without secrets", () => {
    const scheduledTrigger = ScheduledTaskRunTriggerKindValue.create("scheduled");
    const unsupportedTrigger = ScheduledTaskRunTriggerKindValue.create("webhook");
    const unsupportedStatus = ScheduledTaskRunStatusValue.create("queued");
    const invalidExitCode = ScheduledTaskRunExitCode.create(300);
    const unsafeFailureSummary = ScheduledTaskRunFailureSummary.create("token=secret");

    expect(scheduledTrigger.isOk()).toBe(true);
    expect(unsupportedTrigger.isErr()).toBe(true);
    expect(unsupportedStatus.isErr()).toBe(true);
    expect(invalidExitCode.isErr()).toBe(true);
    expect(unsafeFailureSummary.isErr()).toBe(true);

    const skipped = ScheduledTaskRunAttempt.create({
      id: ScheduledTaskRunId.rehydrate("str_daily_migration_skipped"),
      taskId: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      triggerKind: scheduledTrigger._unsafeUnwrap(),
      createdAt: CreatedAt.rehydrate("2026-05-05T01:00:00.000Z"),
    })._unsafeUnwrap();

    const skippedResult = skipped.markSkipped({
      finishedAt: FinishedAt.rehydrate("2026-05-05T01:00:01.000Z"),
      skippedReason: ScheduledTaskRunSkippedReasonValue.concurrencyForbidden(),
      failureSummary: ScheduledTaskRunFailureSummary.create(
        "Previous run is still active",
      )._unsafeUnwrap(),
    });

    expect(skippedResult.isOk()).toBe(true);
    expect(skipped.isTerminal()).toBe(true);
    expect(skipped.toState().status.value).toBe("skipped");
    expect(skipped.toState().skippedReason?.value).toBe("concurrency-forbidden");

    const failed = ScheduledTaskRunAttempt.create({
      id: ScheduledTaskRunId.rehydrate("str_daily_migration_failed"),
      taskId: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      triggerKind: ScheduledTaskRunTriggerKindValue.manual(),
      createdAt: CreatedAt.rehydrate("2026-05-05T02:00:00.000Z"),
    })._unsafeUnwrap();

    failed
      .start({
        startedAt: StartedAt.rehydrate("2026-05-05T02:00:01.000Z"),
      })
      ._unsafeUnwrap();

    const failedResult = failed.markFailed({
      finishedAt: FinishedAt.rehydrate("2026-05-05T02:00:03.000Z"),
      exitCode: ScheduledTaskRunExitCode.rehydrate(1),
      failureSummary: ScheduledTaskRunFailureSummary.create(
        "Command exited with code 1",
      )._unsafeUnwrap(),
    });

    expect(failedResult.isOk()).toBe(true);
    expect(failed.toState().status.value).toBe("failed");
    expect(failed.toState().exitCode?.value).toBe(1);
    expect(failed.toState().failureSummary?.value).toBe("Command exited with code 1");

    const invalidFailure = ScheduledTaskRunAttempt.create({
      id: ScheduledTaskRunId.rehydrate("str_daily_migration_invalid_failure"),
      taskId: ScheduledTaskId.rehydrate("tsk_daily_migration"),
      resourceId: ResourceId.rehydrate("res_api"),
      triggerKind: ScheduledTaskRunTriggerKindValue.manual(),
      createdAt: CreatedAt.rehydrate("2026-05-05T02:01:00.000Z"),
    })._unsafeUnwrap();
    invalidFailure
      .start({
        startedAt: StartedAt.rehydrate("2026-05-05T02:01:01.000Z"),
      })
      ._unsafeUnwrap();

    const invalidFailureResult = invalidFailure.markFailed({
      finishedAt: FinishedAt.rehydrate("2026-05-05T02:01:02.000Z"),
      exitCode: ScheduledTaskRunExitCode.rehydrate(0),
      failureSummary: ScheduledTaskRunFailureSummary.create("Command failed")._unsafeUnwrap(),
    });

    expect(invalidFailureResult.isErr()).toBe(true);

    if (unsafeFailureSummary.isErr()) {
      expect(unsafeFailureSummary.error.details).toMatchObject({
        phase: "scheduled-task-run-admission",
        field: "failureSummary",
      });
    }
  });
});
