import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  ConfigureScheduledTaskCommand,
  CreateScheduledTaskCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  type QueryBus,
  RunScheduledTaskNowCommand,
  ScheduledTaskRunLogsQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

function executionContextFactory(requestId: string): ExecutionContextFactory {
  return {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
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

function createHarness() {
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      if (command instanceof RunScheduledTaskNowCommand) {
        return ok({
          schemaVersion: "scheduled-tasks.run-now/v1",
          run: {
            runId: "str_daily_migration_1",
            taskId: "tsk_daily_migration",
            resourceId: "res_api",
            triggerKind: "manual",
            status: "accepted",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        } as T);
      }

      return ok({
        schemaVersion: "scheduled-tasks.command/v1",
        task: scheduledTaskSummary(),
      } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      return ok({
        schemaVersion: "scheduled-task-runs.logs/v1",
        runId: "str_daily_migration_1",
        taskId: "tsk_daily_migration",
        resourceId: "res_api",
        entries: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as unknown as QueryBus;

  return { commandBus, commands, queries, queryBus };
}

async function withMutedStdout(callback: () => Promise<void>) {
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await callback();
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI scheduled task commands", () => {
  test("[SCHED-TASK-ENTRY-001] scheduled-task commands dispatch application messages", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const harness = createHarness();
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: harness.commandBus,
      queryBus: harness.queryBus,
      executionContextFactory: executionContextFactory("req_cli_scheduled_task_test"),
    });

    await withMutedStdout(async () => {
      await program.parseAsync([
        "node",
        "appaloft",
        "scheduled-task",
        "create",
        "res_api",
        "--schedule",
        "*/15 * * * *",
        "--timezone",
        "UTC",
        "--command",
        "bun run migrate",
        "--timeout-seconds",
        "600",
        "--retry-limit",
        "2",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "scheduled-task",
        "configure",
        "tsk_daily_migration",
        "--resource-id",
        "res_api",
        "--status",
        "disabled",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "scheduled-task",
        "run",
        "tsk_daily_migration",
        "--resource-id",
        "res_api",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "scheduled-task",
        "runs",
        "logs",
        "str_daily_migration_1",
        "--resource-id",
        "res_api",
      ]);
    });

    expect(harness.commands[0]).toBeInstanceOf(CreateScheduledTaskCommand);
    expect(harness.commands[0]).toMatchObject({
      resourceId: "res_api",
      schedule: "*/15 * * * *",
      timezone: "UTC",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      retryLimit: 2,
    });
    expect(harness.commands[1]).toBeInstanceOf(ConfigureScheduledTaskCommand);
    expect(harness.commands[1]).toMatchObject({
      taskId: "tsk_daily_migration",
      resourceId: "res_api",
      status: "disabled",
    });
    expect(harness.commands[2]).toBeInstanceOf(RunScheduledTaskNowCommand);
    expect(harness.queries[0]).toBeInstanceOf(ScheduledTaskRunLogsQuery);
    expect(harness.queries[0]).toMatchObject({
      runId: "str_daily_migration_1",
      resourceId: "res_api",
    });
  });
});
