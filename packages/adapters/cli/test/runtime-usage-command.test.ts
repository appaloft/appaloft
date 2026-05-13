import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
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

describe("CLI runtime usage commands", () => {
  test("[RT-USAGE-008] runtime-usage inspect dispatches the application query", async () => {
    ensureReflectMetadata();
    const { createExecutionContext, InspectRuntimeUsageQuery } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "runtime-usage.inspect/v1",
          scope: { kind: "server", serverId: "srv_primary" },
          generatedAt: "2026-01-01T00:00:10.000Z",
          observedAt: "2026-01-01T00:00:05.000Z",
          freshness: "live",
          partial: false,
          totals: {
            disk: {
              totalBytes: 1000,
              usedBytes: 400,
              availableBytes: 600,
              attributedBytes: 30,
            },
          },
          byProject: [],
          byEnvironment: [],
          byResource: [],
          byDeployment: [],
          artifacts: [],
          warnings: [],
          sourceErrors: [],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_runtime_usage_inspect_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "runtime-usage",
        "inspect",
        "server:srv_primary",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(InspectRuntimeUsageQuery);
    expect(queries[0]).toMatchObject({
      input: {
        scope: {
          kind: "server",
          serverId: "srv_primary",
        },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    });
  });
});
