import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ResourceId,
  ScheduledTaskCommandIntent,
  ScheduledTaskConcurrencyPolicyValue,
  ScheduledTaskDefinition,
  ScheduledTaskDefinitionStatusValue,
  ScheduledTaskId,
  ScheduledTaskRetryLimit,
  ScheduledTaskScheduleExpression,
  ScheduledTaskTimeoutSeconds,
  ScheduledTaskTimezone,
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
});
