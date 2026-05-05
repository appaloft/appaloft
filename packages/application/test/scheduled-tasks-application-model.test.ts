import { describe, expect, test } from "bun:test";

import { operationCatalog } from "../src/operation-catalog";
import {
  CreateScheduledTaskCommand,
  ListScheduledTaskRunsQuery,
  ListScheduledTasksQuery,
  RunScheduledTaskNowCommand,
  ScheduledTaskRunLogsQuery,
  UpdateScheduledTaskCommand,
} from "../src/scheduled-task-messages";

const scheduledTaskOperationKeys = [
  "scheduled-tasks.create",
  "scheduled-tasks.list",
  "scheduled-tasks.show",
  "scheduled-tasks.update",
  "scheduled-tasks.delete",
  "scheduled-tasks.run-now",
  "scheduled-task-runs.list",
  "scheduled-task-runs.show",
  "scheduled-task-runs.logs",
];

describe("scheduled task application model", () => {
  test("[SCHED-TASK-CATALOG-001] target operations remain inactive until catalog activation", () => {
    const activeKeys = new Set<string>(operationCatalog.map((entry) => entry.key));

    for (const operationKey of scheduledTaskOperationKeys) {
      expect(activeKeys.has(operationKey)).toBe(false);
    }
  });

  test("[SCHED-TASK-APP-001] command and query messages parse scheduled task inputs", () => {
    const create = CreateScheduledTaskCommand.create({
      resourceId: " res_api ",
      schedule: "*/15 * * * *",
      timezone: "UTC",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      retryLimit: 2,
    });
    const update = UpdateScheduledTaskCommand.create({
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      status: "disabled",
    });
    const runNow = RunScheduledTaskNowCommand.create({
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      idempotencyKey: "run-now-1",
    });
    const listTasks = ListScheduledTasksQuery.create({
      resourceId: "res_api",
      status: "enabled",
      limit: 25,
    });
    const listRuns = ListScheduledTaskRunsQuery.create({
      taskId: "tsk_daily_migration",
      status: "failed",
      triggerKind: "scheduled",
    });
    const logs = ScheduledTaskRunLogsQuery.create({
      runId: "str_daily_migration_1",
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      limit: 50,
    });

    expect(create.isOk()).toBe(true);
    expect(update.isOk()).toBe(true);
    expect(runNow.isOk()).toBe(true);
    expect(listTasks.isOk()).toBe(true);
    expect(listRuns.isOk()).toBe(true);
    expect(logs.isOk()).toBe(true);

    expect(create._unsafeUnwrap()).toMatchObject({
      resourceId: "res_api",
      concurrencyPolicy: "forbid",
      status: "enabled",
    });
    expect(update._unsafeUnwrap()).toMatchObject({
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      status: "disabled",
    });
    expect(runNow._unsafeUnwrap()).toMatchObject({
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      idempotencyKey: "run-now-1",
    });
    expect(listTasks._unsafeUnwrap()).toMatchObject({
      resourceId: "res_api",
      status: "enabled",
      limit: 25,
    });
    expect(listRuns._unsafeUnwrap()).toMatchObject({
      taskId: "tsk_daily_migration",
      status: "failed",
      triggerKind: "scheduled",
    });
    expect(logs._unsafeUnwrap()).toMatchObject({
      runId: "str_daily_migration_1",
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      limit: 50,
    });
  });
});
