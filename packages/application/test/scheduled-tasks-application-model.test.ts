import { describe, expect, test } from "bun:test";

import { type OperationCatalogEntry, operationCatalog } from "../src/operation-catalog";
import {
  ConfigureScheduledTaskCommand,
  CreateScheduledTaskCommand,
  ListScheduledTaskRunsQuery,
  ListScheduledTasksQuery,
  RunScheduledTaskNowCommand,
  ScheduledTaskRunLogsQuery,
} from "../src/scheduled-task-messages";

const scheduledTaskOperationKeys = [
  "scheduled-tasks.create",
  "scheduled-tasks.list",
  "scheduled-tasks.show",
  "scheduled-tasks.configure",
  "scheduled-tasks.delete",
  "scheduled-tasks.run-now",
  "scheduled-task-runs.list",
  "scheduled-task-runs.show",
  "scheduled-task-runs.logs",
];

describe("scheduled task application model", () => {
  test("[SCHED-TASK-CATALOG-001] target operations are active in the catalog", () => {
    const catalogEntries: readonly OperationCatalogEntry[] = operationCatalog;
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      catalogEntries.map((entry) => [entry.key, entry]),
    );

    for (const operationKey of scheduledTaskOperationKeys) {
      const entry = entriesByKey.get(operationKey);

      expect(entry, operationKey).toBeDefined();
      expect(entry?.inputSchema, operationKey).toBeDefined();
      expect(entry?.transports.cli, operationKey).toBeTruthy();
      expect(entry?.transports.orpc, operationKey).toBeDefined();
    }

    expect(entriesByKey.get("scheduled-tasks.create")).toMatchObject({
      kind: "command",
      domain: "scheduled-tasks",
      messageName: "CreateScheduledTaskCommand",
      handlerName: "CreateScheduledTaskCommandHandler",
      serviceName: "CreateScheduledTaskUseCase",
      transports: {
        orpc: { method: "POST", path: "/api/scheduled-tasks" },
      },
    });
    expect(entriesByKey.get("scheduled-task-runs.logs")).toMatchObject({
      kind: "query",
      domain: "scheduled-task-runs",
      messageName: "ScheduledTaskRunLogsQuery",
      handlerName: "ScheduledTaskRunLogsQueryHandler",
      serviceName: "ScheduledTaskRunLogsQueryService",
      transports: {
        orpc: { method: "GET", path: "/api/scheduled-task-runs/{runId}/logs" },
      },
    });
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
    const configure = ConfigureScheduledTaskCommand.create({
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
    expect(configure.isOk()).toBe(true);
    expect(runNow.isOk()).toBe(true);
    expect(listTasks.isOk()).toBe(true);
    expect(listRuns.isOk()).toBe(true);
    expect(logs.isOk()).toBe(true);

    expect(create._unsafeUnwrap()).toMatchObject({
      resourceId: "res_api",
      concurrencyPolicy: "forbid",
      status: "enabled",
    });
    expect(configure._unsafeUnwrap()).toMatchObject({
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
