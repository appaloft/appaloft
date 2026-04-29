import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  ListOperatorWorkQuery,
  type QueryBus,
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
});
