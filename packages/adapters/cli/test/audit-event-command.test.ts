import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  ConfigureAuditEventLegalHoldCommand,
  CreateAuditEventArchiveCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  ExportAuditEventsQuery,
  ExportGlobalAuditEventsQuery,
  ListAuditEventArchivesQuery,
  ListAuditEventLegalHoldsQuery,
  PruneAuditEventArchivesCommand,
  PruneAuditEventsCommand,
  type QueryBus,
  ReleaseAuditEventLegalHoldCommand,
  ShowAuditEventArchiveQuery,
  ShowAuditEventLegalHoldQuery,
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

describe("CLI audit event commands", () => {
  test("[AUDIT-EVENT-EXPORT-003] audit-event export dispatches the application query", async () => {
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
          schemaVersion: "audit-events.export/v1",
          aggregateId: "res_web",
          filters: {
            eventType: "resource-variable-set",
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-01-01T00:02:00.000Z",
            limit: 10,
          },
          items: [],
          itemCount: 0,
          truncated: false,
          generatedAt: "2026-01-01T00:02:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_audit_event_export_test",
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
        "audit-event",
        "export",
        "--aggregate",
        "res_web",
        "--event-type",
        "resource-variable-set",
        "--from",
        "2026-01-01T00:00:00.000Z",
        "--to",
        "2026-01-01T00:02:00.000Z",
        "--limit",
        "10",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ExportAuditEventsQuery);
    expect(queries[0]).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:02:00.000Z",
      limit: 10,
    });
  });

  test("[AUDIT-EVENT-GLOBAL-EXPORT-004] audit-event export-global dispatches the application query", async () => {
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
          schemaVersion: "audit-events.export-global/v1",
          filters: {
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-01-01T00:02:00.000Z",
            limit: 10,
          },
          items: [],
          itemCount: 0,
          truncated: false,
          generatedAt: "2026-01-01T00:02:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_audit_event_global_export_test",
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
        "audit-event",
        "export-global",
        "--aggregate",
        "res_web",
        "--event-type",
        "resource-variable-set",
        "--from",
        "2026-01-01T00:00:00.000Z",
        "--to",
        "2026-01-01T00:02:00.000Z",
        "--limit",
        "10",
        "--cursor",
        "2026-01-01T00:01:00.000Z|aud_res_1",
        "--order",
        "desc",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ExportGlobalAuditEventsQuery);
    expect(queries[0]).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:02:00.000Z",
      limit: 10,
      cursor: "2026-01-01T00:01:00.000Z|aud_res_1",
      order: "desc",
    });
  });

  test("[AUDIT-EVENT-PRUNE-004] audit-event prune dispatches the application command", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "audit-events.prune/v1",
          before: "2026-01-01T00:05:00.000Z",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          dryRun: false,
          matchedCount: 1,
          prunedCount: 1,
          heldCount: 0,
          archiveRetainedCount: 0,
          countsByEventType: {
            "resource-variable-set": 1,
          },
          heldCountsByEventType: {},
          archiveRetainedCountsByEventType: {},
          activeHoldIds: [],
          activeArchiveIds: [],
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
          requestId: "req_cli_audit_event_prune_test",
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
        "audit-event",
        "prune",
        "--before",
        "2026-01-01T00:05:00.000Z",
        "--aggregate",
        "res_web",
        "--event-type",
        "resource-variable-set",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PruneAuditEventsCommand);
    expect(commands[0]).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      dryRun: false,
    });
  });

  test("[AUDIT-EVENT-HOLD-006] audit-event legal-hold commands dispatch application messages", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "audit-events.legal-holds.hold/v1",
          hold: {
            holdId: "ahl_support",
            status: "active",
            scope: { kind: "aggregate", aggregateId: "res_web" },
            reason: "support incident",
            createdAt: "2026-01-01T00:10:00.000Z",
          },
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        if (query instanceof ShowAuditEventLegalHoldQuery) {
          return ok({
            schemaVersion: "audit-events.legal-holds.show/v1",
            hold: {
              holdId: "ahl_support",
              status: "active",
              scope: { kind: "aggregate", aggregateId: "res_web" },
              reason: "support incident",
              createdAt: "2026-01-01T00:10:00.000Z",
            },
            generatedAt: "2026-01-01T00:11:00.000Z",
          } as T);
        }

        return ok({
          schemaVersion: "audit-events.legal-holds.list/v1",
          items: [],
          generatedAt: "2026-01-01T00:11:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_audit_event_legal_hold_test",
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
        "audit-event",
        "legal-hold",
        "configure",
        "--aggregate",
        "res_web",
        "--event-type",
        "resource-variable-set",
        "--reason",
        "support incident",
        "--requested-by",
        "operator@example.com",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "audit-event",
        "legal-hold",
        "list",
        "--status",
        "active",
        "--aggregate",
        "res_web",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "audit-event",
        "legal-hold",
        "show",
        "ahl_support",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "audit-event",
        "legal-hold",
        "release",
        "ahl_support",
        "--reason",
        "case closed",
        "--released-by",
        "operator@example.com",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands[0]).toBeInstanceOf(ConfigureAuditEventLegalHoldCommand);
    expect(commands[0]).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      reason: "support incident",
      requestedBy: "operator@example.com",
    });
    expect(queries[0]).toBeInstanceOf(ListAuditEventLegalHoldsQuery);
    expect(queries[0]).toMatchObject({
      status: "active",
      aggregateId: "res_web",
    });
    expect(queries[1]).toBeInstanceOf(ShowAuditEventLegalHoldQuery);
    expect(queries[1]).toMatchObject({ holdId: "ahl_support" });
    expect(commands[1]).toBeInstanceOf(ReleaseAuditEventLegalHoldCommand);
    expect(commands[1]).toMatchObject({
      holdId: "ahl_support",
      releaseReason: "case closed",
      releasedBy: "operator@example.com",
    });
  });

  test("[AUDIT-EVENT-ARCHIVE-006] audit-event archive commands dispatch application messages", async () => {
    ensureReflectMetadata();
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const archiveSummary = {
      archiveId: "aar_support",
      archiveSchemaVersion: "audit-events.archive/v1" as const,
      source: { kind: "aggregate" as const, aggregateId: "res_web" },
      eventType: "resource-variable-set",
      reason: "support incident",
      itemCount: 1,
      truncated: false,
      contentDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      retainSourceRows: true,
      createdAt: "2026-01-01T00:10:00.000Z",
    };
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof PruneAuditEventArchivesCommand) {
          return ok({
            schemaVersion: "audit-events.archives.prune/v1",
            before: "2026-01-01T00:20:00.000Z",
            dryRun: false,
            matchedCount: 1,
            prunedCount: 1,
            countsBySourceKind: { aggregate: 1 },
            countsByEventType: { "resource-variable-set": 1 },
            prunedAt: "2026-01-01T00:21:00.000Z",
          } as T);
        }

        return ok({
          schemaVersion: "audit-events.archives.archive/v1",
          archive: archiveSummary,
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        if (query instanceof ShowAuditEventArchiveQuery) {
          return ok({
            schemaVersion: "audit-events.archives.show/v1",
            archive: {
              ...archiveSummary,
              items: [],
            },
            generatedAt: "2026-01-01T00:11:00.000Z",
          } as T);
        }

        return ok({
          schemaVersion: "audit-events.archives.list/v1",
          items: [archiveSummary],
          generatedAt: "2026-01-01T00:11:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_audit_event_archive_test",
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
        "audit-event",
        "archive",
        "create",
        "--aggregate",
        "res_web",
        "--event-type",
        "resource-variable-set",
        "--reason",
        "support incident",
        "--retain-source-rows",
        "true",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "audit-event",
        "archive",
        "list",
        "--aggregate",
        "res_web",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "audit-event",
        "archive",
        "show",
        "aar_support",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "audit-event",
        "archive",
        "prune",
        "--before",
        "2026-01-01T00:20:00.000Z",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands[0]).toBeInstanceOf(CreateAuditEventArchiveCommand);
    expect(commands[0]).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      reason: "support incident",
      retainSourceRows: true,
    });
    expect(queries[0]).toBeInstanceOf(ListAuditEventArchivesQuery);
    expect(queries[0]).toMatchObject({ aggregateId: "res_web" });
    expect(queries[1]).toBeInstanceOf(ShowAuditEventArchiveQuery);
    expect(queries[1]).toMatchObject({ archiveId: "aar_support" });
    expect(commands[1]).toBeInstanceOf(PruneAuditEventArchivesCommand);
    expect(commands[1]).toMatchObject({
      before: "2026-01-01T00:20:00.000Z",
      dryRun: false,
    });
  });
});
