import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  CancelOperatorWorkCommand,
  type CommandBus,
  createExecutionContext,
  DeadLetterOperatorWorkCommand,
  type ExecutionContextFactory,
  ListOperatorWorkQuery,
  MarkOperatorWorkRecoveredCommand,
  type OperatorWorkEventStream,
  type OperatorWorkEventStreamEnvelope,
  PruneOperatorWorkCommand,
  type QueryBus,
  RetryOperatorWorkCommand,
  ShowOperatorWorkQuery,
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

function createExecutionContextFactory(requestId: string): ExecutionContextFactory {
  return {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
}

class CloseTrackingOperatorWorkEventStream implements OperatorWorkEventStream {
  closed = false;

  constructor(private readonly envelopes: OperatorWorkEventStreamEnvelope[]) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<OperatorWorkEventStreamEnvelope> {
    for (const envelope of this.envelopes) {
      yield envelope;
    }
  }
}

describe("CLI operator work commands", () => {
  test("[OP-WORK-CLI-001] work list dispatches the read-only application query", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "operator-work.list/v1",
          items: [],
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory("req_cli_operator_work_list_test"),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "list",
        "--kind",
        "deployment",
        "--status",
        "failed",
        "--resource-id",
        "res_web",
        "--server-id",
        "srv_primary",
        "--deployment-id",
        "dep_failed",
        "--limit",
        "25",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ListOperatorWorkQuery);
    expect(queries[0]).toMatchObject({
      kind: "deployment",
      status: "failed",
      resourceId: "res_web",
      serverId: "srv_primary",
      deploymentId: "dep_failed",
      limit: 25,
    });
  });

  test("[OP-WORK-CLI-002] work show dispatches the read-only detail query", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "operator-work.show/v1",
          item: {
            id: "dep_failed",
            kind: "deployment",
            status: "failed",
            operationKey: "deployments.create",
            updatedAt: "2026-01-01T00:00:09.000Z",
            nextActions: ["diagnostic"],
          },
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory("req_cli_operator_work_show_test"),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync(["node", "appaloft", "work", "show", "dep_failed"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowOperatorWorkQuery);
    expect(queries[0]).toMatchObject({
      workId: "dep_failed",
    });
  });

  test("[OP-WORK-ENTRY-003A] work events --follow --json dispatches stream query and closes cleanly", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const { StreamOperatorWorkEventsQuery } = await import("@appaloft/application");
    const queries: AppQuery<unknown>[] = [];
    const stream = new CloseTrackingOperatorWorkEventStream([
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "heartbeat",
        at: "2026-01-01T00:00:00.000Z",
        cursor: "wrk_blueprint_install:1",
      },
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "wrk_blueprint_install:2",
      },
    ]);
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          mode: "stream",
          workId: "wrk_blueprint_install",
          stream,
        } as T);
      },
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory("req_cli_operator_work_events_test"),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "events",
        "wrk_blueprint_install",
        "--follow",
        "--json",
        "--cursor",
        "wrk_blueprint_install:1",
        "--history-limit",
        "25",
        "--poll-interval-ms",
        "50",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(StreamOperatorWorkEventsQuery);
    expect(queries[0]).toMatchObject({
      workId: "wrk_blueprint_install",
      cursor: "wrk_blueprint_install:1",
      follow: true,
      includeHistory: true,
      historyLimit: 25,
      pollIntervalMs: 50,
    });
    expect(stream.closed).toBe(true);
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-004] work mark-recovered dispatches the command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          workId: "wrk_failed",
          status: "succeeded",
          recoveredAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory(
        "req_cli_operator_work_recovered_test",
      ),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "mark-recovered",
        "wrk_failed",
        "--reason",
        "fixed target permissions",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(MarkOperatorWorkRecoveredCommand);
    expect(commands[0]).toMatchObject({
      workId: "wrk_failed",
      reason: "fixed target permissions",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-006] work dead-letter dispatches the command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          workId: "wrk_failed",
          status: "dead-lettered",
          deadLetteredAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory(
        "req_cli_operator_work_dead_letter_test",
      ),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "dead-letter",
        "wrk_failed",
        "--reason",
        "external dependency requires vendor support",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeadLetterOperatorWorkCommand);
    expect(commands[0]).toMatchObject({
      workId: "wrk_failed",
      reason: "external dependency requires vendor support",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-008] work cancel dispatches the command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          workId: "wrk_pending",
          status: "canceled",
          canceledAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory("req_cli_operator_work_cancel_test"),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "cancel",
        "wrk_pending",
        "--reason",
        "operator stopped queued work",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(CancelOperatorWorkCommand);
    expect(commands[0]).toMatchObject({
      workId: "wrk_pending",
      reason: "operator stopped queued work",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-010] work retry dispatches the command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          workId: "wrk_retry_next",
          status: "pending",
          retryOfWorkId: "wrk_failed",
          retriedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory("req_cli_operator_work_retry_test"),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "retry",
        "wrk_failed",
        "--reason",
        "operator confirmed dependency is healthy",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RetryOperatorWorkCommand);
    expect(commands[0]).toMatchObject({
      workId: "wrk_failed",
      reason: "operator confirmed dependency is healthy",
    });
  });

  test("[PROC-DELIVERY-009][OP-WORK-ENTRY-012] work prune dispatches the command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          prunedCount: 2,
          matchedCount: 2,
          dryRun: false,
          before: "2026-01-01T00:05:00.000Z",
          statuses: ["failed", "canceled"],
          countsByStatus: {
            failed: 1,
            canceled: 1,
          },
          prunedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: createExecutionContextFactory("req_cli_operator_work_prune_test"),
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "work",
        "prune",
        "--before",
        "2026-01-01T00:05:00.000Z",
        "--status",
        "failed",
        "--status",
        "canceled",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PruneOperatorWorkCommand);
    expect(commands[0]).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed", "canceled"],
      dryRun: false,
    });
  });
});
