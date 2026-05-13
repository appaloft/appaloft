import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  ConfigureRetentionDefaultsCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  ListRetentionDefaultsQuery,
  type QueryBus,
  ShowRetentionDefaultQuery,
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

describe("CLI retention default commands", () => {
  test("[ORG-RETENTION-DEFAULTS-005] configure dispatches the shared command schema", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "rdf_domain_events" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_retention_default_configure_test",
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
        "retention-default",
        "configure",
        "--scope",
        "organization",
        "--organization-id",
        "org_primary",
        "--category",
        "domain-event-streams",
        "--retention-days",
        "90",
        "--destructive-scheduling-enabled",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureRetentionDefaultsCommand);
    expect(commands[0]).toMatchObject({
      input: {
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
        retentionDays: 90,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: true,
        enabled: true,
      },
    });
  });

  test("[ORG-RETENTION-DEFAULTS-005] list and show dispatch shared query schemas", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok(
          queries.length === 1
            ? {
                schemaVersion: "retention-defaults.list/v1",
                items: [],
              }
            : {
                schemaVersion: "retention-defaults.show/v1",
                policy: null,
              },
        ) as T;
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_retention_default_query_test",
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
        "retention-default",
        "list",
        "--scope",
        "system",
        "--category",
        "provider-job-logs",
        "--enabled-only",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "retention-default",
        "show",
        "provider-job-logs",
        "--scope",
        "system",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(2);
    expect(queries[0]).toBeInstanceOf(ListRetentionDefaultsQuery);
    expect(queries[0]).toMatchObject({
      input: {
        scope: "system",
        category: "provider-job-logs",
        enabledOnly: true,
      },
    });
    expect(queries[1]).toBeInstanceOf(ShowRetentionDefaultQuery);
    expect(queries[1]).toMatchObject({
      input: {
        scope: "system",
        category: "provider-job-logs",
      },
    });
  });
});
