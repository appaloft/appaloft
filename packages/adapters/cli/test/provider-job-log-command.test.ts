import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  PruneProviderJobLogsCommand,
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

describe("CLI provider job log commands", () => {
  test("[PROV-JOB-LOG-PRUNE-004] provider-job-log prune dispatches the application command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "provider-job-logs.prune/v1",
          before: "2026-01-01T00:05:00.000Z",
          deploymentId: "dep_primary",
          providerKey: "generic-ssh",
          resourceId: "res_web",
          serverId: "srv_primary",
          dryRun: false,
          matchedCount: 1,
          prunedCount: 1,
          countsByProviderKey: {
            "generic-ssh": 1,
          },
          prunedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_provider_job_log_prune_test",
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
        "provider-job-log",
        "prune",
        "--before",
        "2026-01-01T00:05:00.000Z",
        "--deployment",
        "dep_primary",
        "--provider",
        "generic-ssh",
        "--resource",
        "res_web",
        "--server",
        "srv_primary",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PruneProviderJobLogsCommand);
    expect(commands[0]).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: "dep_primary",
      providerKey: "generic-ssh",
      resourceId: "res_web",
      serverId: "srv_primary",
      dryRun: false,
    });
  });
});
