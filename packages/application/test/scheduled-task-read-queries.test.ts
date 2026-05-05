import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { FixedClock } from "@appaloft/testkit";

import {
  createExecutionContext,
  ListScheduledTaskRunsQuery,
  ListScheduledTaskRunsQueryHandler,
  ListScheduledTaskRunsQueryService,
  type ListScheduledTaskRunsResult,
  ListScheduledTasksQuery,
  ListScheduledTasksQueryHandler,
  ListScheduledTasksQueryService,
  type ListScheduledTasksResult,
  type RepositoryContext,
  type ScheduledTaskDefinitionSummary,
  type ScheduledTaskReadModel,
  type ScheduledTaskRunLogReadModel,
  ScheduledTaskRunLogsQuery,
  ScheduledTaskRunLogsQueryHandler,
  ScheduledTaskRunLogsQueryService,
  type ScheduledTaskRunLogsResult,
  type ScheduledTaskRunReadModel,
  type ScheduledTaskRunSummary,
  ShowScheduledTaskQuery,
  ShowScheduledTaskQueryHandler,
  ShowScheduledTaskQueryService,
  ShowScheduledTaskRunQuery,
  ShowScheduledTaskRunQueryHandler,
  ShowScheduledTaskRunQueryService,
} from "../src";

type ScheduledTaskListInput = Parameters<ScheduledTaskReadModel["list"]>[1];
type ScheduledTaskShowInput = Parameters<ScheduledTaskReadModel["show"]>[1];
type ScheduledTaskRunListInput = Parameters<ScheduledTaskRunReadModel["list"]>[1];
type ScheduledTaskRunShowInput = Parameters<ScheduledTaskRunReadModel["show"]>[1];
type ScheduledTaskRunLogsInput = Parameters<ScheduledTaskRunLogReadModel["read"]>[1];

const generatedAt = "2026-05-05T01:00:00.000Z";

const taskSummary: ScheduledTaskDefinitionSummary = {
  taskId: "tsk_backup",
  resourceId: "res_api",
  schedule: "0 1 * * *",
  timezone: "UTC",
  commandIntent: "bun run backup",
  timeoutSeconds: 600,
  retryLimit: 2,
  concurrencyPolicy: "forbid",
  status: "enabled",
  createdAt: "2026-05-05T00:00:00.000Z",
};

const runSummary: ScheduledTaskRunSummary = {
  runId: "str_manual",
  taskId: "tsk_backup",
  resourceId: "res_api",
  triggerKind: "manual",
  status: "accepted",
  createdAt: "2026-05-05T00:30:00.000Z",
};

class RecordingScheduledTaskReadModel implements ScheduledTaskReadModel {
  listInput?: ScheduledTaskListInput;
  showInput?: ScheduledTaskShowInput;
  showResult: ScheduledTaskDefinitionSummary | null = taskSummary;

  async list(
    _context: RepositoryContext,
    input: ScheduledTaskListInput,
  ): Promise<Omit<ListScheduledTasksResult, "schemaVersion" | "generatedAt">> {
    this.listInput = input;
    return { items: [taskSummary], nextCursor: "cur_tasks_next" };
  }

  async show(
    _context: RepositoryContext,
    input: ScheduledTaskShowInput,
  ): Promise<ScheduledTaskDefinitionSummary | null> {
    this.showInput = input;
    return this.showResult;
  }
}

class RecordingScheduledTaskRunReadModel implements ScheduledTaskRunReadModel {
  listInput?: ScheduledTaskRunListInput;
  showInput?: ScheduledTaskRunShowInput;
  showResult: ScheduledTaskRunSummary | null = runSummary;

  async list(
    _context: RepositoryContext,
    input: ScheduledTaskRunListInput,
  ): Promise<Omit<ListScheduledTaskRunsResult, "schemaVersion" | "generatedAt">> {
    this.listInput = input;
    return { items: [runSummary], nextCursor: "cur_runs_next" };
  }

  async show(
    _context: RepositoryContext,
    input: ScheduledTaskRunShowInput,
  ): Promise<ScheduledTaskRunSummary | null> {
    this.showInput = input;
    return this.showResult;
  }
}

class RecordingScheduledTaskRunLogReadModel implements ScheduledTaskRunLogReadModel {
  readInput?: ScheduledTaskRunLogsInput;

  async read(
    _context: RepositoryContext,
    input: ScheduledTaskRunLogsInput,
  ): Promise<Omit<ScheduledTaskRunLogsResult, "schemaVersion" | "generatedAt">> {
    this.readInput = input;
    return {
      runId: "str_manual",
      taskId: "tsk_backup",
      resourceId: "res_api",
      entries: [
        {
          timestamp: "2026-05-05T00:30:10.000Z",
          stream: "stdout",
          message: "backup complete",
        },
      ],
      nextCursor: "cur_logs_next",
    };
  }
}

function contextFixture() {
  return createExecutionContext({
    requestId: "req_scheduled_task_read_test",
    entrypoint: "system",
  });
}

describe("scheduled task read query services", () => {
  test("[SCHED-TASK-QUERY-001] task list/show queries wrap the scheduled task read model", async () => {
    const context = contextFixture();
    const readModel = new RecordingScheduledTaskReadModel();
    const clock = new FixedClock(generatedAt);
    const listHandler = new ListScheduledTasksQueryHandler(
      new ListScheduledTasksQueryService(readModel, clock),
    );
    const showHandler = new ShowScheduledTaskQueryHandler(
      new ShowScheduledTaskQueryService(readModel, clock),
    );

    const listResult = await listHandler.handle(
      context,
      new ListScheduledTasksQuery("prj_demo", "env_demo", "res_api", "enabled", 20, "cur_tasks"),
    );

    expect(listResult.isOk()).toBe(true);
    expect(listResult._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-tasks.list/v1",
      items: [taskSummary],
      nextCursor: "cur_tasks_next",
      generatedAt,
    });
    expect(readModel.listInput).toEqual({
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_api",
      status: "enabled",
      limit: 20,
      cursor: "cur_tasks",
    });

    const showResult = await showHandler.handle(
      context,
      new ShowScheduledTaskQuery("tsk_backup", "res_api"),
    );

    expect(showResult.isOk()).toBe(true);
    expect(showResult._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-tasks.show/v1",
      task: taskSummary,
      generatedAt,
    });
    expect(readModel.showInput).toEqual({ taskId: "tsk_backup", resourceId: "res_api" });
  });

  test("[SCHED-TASK-QUERY-002] missing task show query returns structured not-found details", async () => {
    const context = contextFixture();
    const readModel = new RecordingScheduledTaskReadModel();
    readModel.showResult = null;
    const handler = new ShowScheduledTaskQueryHandler(
      new ShowScheduledTaskQueryService(readModel, new FixedClock(generatedAt)),
    );

    const result = await handler.handle(context, new ShowScheduledTaskQuery("tsk_missing"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
      expect(result.error.details).toMatchObject({
        queryName: "scheduled-tasks.show",
        phase: "scheduled-task-read",
        taskId: "tsk_missing",
      });
    }
  });

  test("[SCHED-TASK-RUN-QUERY-001] run list/show/log queries wrap run-specific read models", async () => {
    const context = contextFixture();
    const runReadModel = new RecordingScheduledTaskRunReadModel();
    const logReadModel = new RecordingScheduledTaskRunLogReadModel();
    const clock = new FixedClock(generatedAt);
    const listHandler = new ListScheduledTaskRunsQueryHandler(
      new ListScheduledTaskRunsQueryService(runReadModel, clock),
    );
    const showHandler = new ShowScheduledTaskRunQueryHandler(
      new ShowScheduledTaskRunQueryService(runReadModel, clock),
    );
    const logsHandler = new ScheduledTaskRunLogsQueryHandler(
      new ScheduledTaskRunLogsQueryService(logReadModel, clock),
    );

    const listResult = await listHandler.handle(
      context,
      new ListScheduledTaskRunsQuery("tsk_backup", "res_api", "accepted", "manual", 10, "cur_runs"),
    );
    const showResult = await showHandler.handle(
      context,
      new ShowScheduledTaskRunQuery("str_manual", "tsk_backup", "res_api"),
    );
    const logsResult = await logsHandler.handle(
      context,
      new ScheduledTaskRunLogsQuery("str_manual", "tsk_backup", "res_api", "cur_logs", 50),
    );

    expect(listResult.isOk()).toBe(true);
    expect(listResult._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-task-runs.list/v1",
      items: [runSummary],
      nextCursor: "cur_runs_next",
      generatedAt,
    });
    expect(runReadModel.listInput).toEqual({
      taskId: "tsk_backup",
      resourceId: "res_api",
      status: "accepted",
      triggerKind: "manual",
      limit: 10,
      cursor: "cur_runs",
    });

    expect(showResult.isOk()).toBe(true);
    expect(showResult._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-task-runs.show/v1",
      run: runSummary,
      generatedAt,
    });
    expect(runReadModel.showInput).toEqual({
      runId: "str_manual",
      taskId: "tsk_backup",
      resourceId: "res_api",
    });

    expect(logsResult.isOk()).toBe(true);
    expect(logsResult._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-task-runs.logs/v1",
      runId: "str_manual",
      taskId: "tsk_backup",
      resourceId: "res_api",
      entries: [
        {
          timestamp: "2026-05-05T00:30:10.000Z",
          stream: "stdout",
          message: "backup complete",
        },
      ],
      nextCursor: "cur_logs_next",
      generatedAt,
    });
    expect(logReadModel.readInput).toEqual({
      runId: "str_manual",
      taskId: "tsk_backup",
      resourceId: "res_api",
      cursor: "cur_logs",
      limit: 50,
    });
  });
});
