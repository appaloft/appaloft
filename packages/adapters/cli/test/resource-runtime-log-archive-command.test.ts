import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  ArchiveResourceRuntimeLogsCommand,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  ListResourceRuntimeLogArchivesQuery,
  PruneResourceRuntimeLogArchivesCommand,
  type QueryBus,
  ShowResourceRuntimeLogArchiveQuery,
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

describe("CLI resource runtime log archive commands", () => {
  test("[RUNTIME-LOG-ARCHIVE-006] resource log-archives commands dispatch shared messages", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof ArchiveResourceRuntimeLogsCommand) {
          return ok({
            schemaVersion: "resources.runtime-logs.archive/v1",
            archive: {
              archiveId: "rla_primary",
              resourceId: "res_web",
              capturedAt: "2026-01-01T00:05:00.000Z",
              lineCount: 0,
              retentionStatus: "retained",
              lines: [],
            },
          } as T);
        }

        return ok({
          schemaVersion: "resources.runtime-log-archives.prune/v1",
          before: "2026-01-01T00:00:00.000Z",
          resourceId: "res_web",
          dryRun: false,
          matchedCount: 1,
          prunedCount: 1,
          affectedResourceCount: 1,
          prunedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        if (query instanceof ListResourceRuntimeLogArchivesQuery) {
          return ok({
            schemaVersion: "resources.runtime-log-archives.list/v1",
            items: [],
            generatedAt: "2026-01-01T00:06:00.000Z",
          } as T);
        }

        return ok({
          schemaVersion: "resources.runtime-log-archives.show/v1",
          archive: {
            archiveId: "rla_primary",
            resourceId: "res_web",
            capturedAt: "2026-01-01T00:05:00.000Z",
            lineCount: 0,
            retentionStatus: "retained",
            lines: [],
          },
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_runtime_log_archive_test",
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
        "resource",
        "log-archives",
        "archive",
        "res_web",
        "--deployment",
        "dep_primary",
        "--service",
        "web",
        "--tail",
        "20",
        "--reason",
        "delete safety evidence",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "log-archives",
        "list",
        "--resource",
        "res_web",
        "--service",
        "web",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "log-archives",
        "show",
        "rla_primary",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "log-archives",
        "prune",
        "--before",
        "2026-01-01T00:00:00.000Z",
        "--resource",
        "res_web",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands[0]).toBeInstanceOf(ArchiveResourceRuntimeLogsCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_web",
      deploymentId: "dep_primary",
      serviceName: "web",
      tailLines: 20,
      reason: "delete safety evidence",
    });
    expect(queries[0]).toBeInstanceOf(ListResourceRuntimeLogArchivesQuery);
    expect(queries[0]).toMatchObject({ resourceId: "res_web", serviceName: "web" });
    expect(queries[1]).toBeInstanceOf(ShowResourceRuntimeLogArchiveQuery);
    expect(queries[1]).toMatchObject({ archiveId: "rla_primary" });
    expect(commands[1]).toBeInstanceOf(PruneResourceRuntimeLogArchivesCommand);
    expect(commands[1]).toMatchObject({
      before: "2026-01-01T00:00:00.000Z",
      resourceId: "res_web",
      dryRun: false,
    });
  });
});
