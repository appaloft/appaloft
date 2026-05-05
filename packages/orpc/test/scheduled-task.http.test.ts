import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureScheduledTaskCommand,
  CreateScheduledTaskCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListScheduledTasksQuery,
  type Query,
  type QueryBus,
  RunScheduledTaskNowCommand,
  ScheduledTaskRunLogsQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_scheduled_task_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function scheduledTaskSummary() {
  return {
    taskId: "tsk_daily_migration",
    resourceId: "res_api",
    schedule: "*/15 * * * *",
    timezone: "UTC",
    commandIntent: "bun run migrate",
    timeoutSeconds: 600,
    retryLimit: 2,
    concurrencyPolicy: "forbid" as const,
    status: "enabled" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function scheduledTaskRunSummary() {
  return {
    runId: "str_daily_migration_1",
    taskId: "tsk_daily_migration",
    resourceId: "res_api",
    triggerKind: "manual" as const,
    status: "accepted" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createHarness() {
  const commands: Command<unknown>[] = [];
  const queries: Query<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      commands.push(command as Command<unknown>);
      if (command instanceof RunScheduledTaskNowCommand) {
        return ok({
          schemaVersion: "scheduled-tasks.run-now/v1",
          run: scheduledTaskRunSummary(),
        } as T);
      }
      return ok({
        schemaVersion: "scheduled-tasks.command/v1",
        task: scheduledTaskSummary(),
      } as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      queries.push(query as Query<unknown>);
      if (query instanceof ScheduledTaskRunLogsQuery) {
        return ok({
          schemaVersion: "scheduled-task-runs.logs/v1",
          runId: "str_daily_migration_1",
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
          entries: [
            {
              timestamp: "2026-01-01T00:00:00.000Z",
              stream: "system",
              message: "Scheduled task run accepted",
            },
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      return ok({
        schemaVersion: "scheduled-tasks.list/v1",
        items: [scheduledTaskSummary()],
        generatedAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as QueryBus;
  const app = mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });

  return { app, commands, queries };
}

describe("scheduled task HTTP routes", () => {
  test("[SCHED-TASK-ENTRY-001] dispatches scheduled task commands and queries through HTTP", async () => {
    const harness = createHarness();

    const createResponse = await harness.app.handle(
      new Request("http://localhost/api/scheduled-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: "res_api",
          schedule: "*/15 * * * *",
          timezone: "UTC",
          commandIntent: "bun run migrate",
          timeoutSeconds: 600,
          retryLimit: 2,
        }),
      }),
    );
    const listResponse = await harness.app.handle(
      new Request("http://localhost/api/scheduled-tasks?resourceId=res_api&status=enabled", {
        method: "GET",
      }),
    );
    const configureResponse = await harness.app.handle(
      new Request("http://localhost/api/scheduled-tasks/tsk_daily_migration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
          status: "disabled",
        }),
      }),
    );
    const runNowResponse = await harness.app.handle(
      new Request("http://localhost/api/scheduled-tasks/tsk_daily_migration/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: "tsk_daily_migration",
          resourceId: "res_api",
        }),
      }),
    );
    const logsResponse = await harness.app.handle(
      new Request("http://localhost/api/scheduled-task-runs/str_daily_migration_1/logs", {
        method: "GET",
      }),
    );

    expect(createResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(configureResponse.status).toBe(200);
    expect(runNowResponse.status).toBe(202);
    expect(logsResponse.status).toBe(200);
    expect(await createResponse.json()).toMatchObject({
      schemaVersion: "scheduled-tasks.command/v1",
      task: { taskId: "tsk_daily_migration", resourceId: "res_api" },
    });
    expect(await listResponse.json()).toMatchObject({
      schemaVersion: "scheduled-tasks.list/v1",
      items: [{ taskId: "tsk_daily_migration" }],
    });
    expect(await configureResponse.json()).toMatchObject({
      schemaVersion: "scheduled-tasks.command/v1",
      task: { taskId: "tsk_daily_migration", resourceId: "res_api" },
    });
    expect(await runNowResponse.json()).toMatchObject({
      schemaVersion: "scheduled-tasks.run-now/v1",
      run: { runId: "str_daily_migration_1" },
    });
    expect(await logsResponse.json()).toMatchObject({
      schemaVersion: "scheduled-task-runs.logs/v1",
      entries: [{ stream: "system" }],
    });
    expect(harness.commands[0]).toBeInstanceOf(CreateScheduledTaskCommand);
    expect(harness.commands[1]).toBeInstanceOf(ConfigureScheduledTaskCommand);
    expect(harness.commands[2]).toBeInstanceOf(RunScheduledTaskNowCommand);
    expect(harness.queries[0]).toBeInstanceOf(ListScheduledTasksQuery);
    expect(harness.queries[1]).toBeInstanceOf(ScheduledTaskRunLogsQuery);
  });
});
