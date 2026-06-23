import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureAuditEventLegalHoldCommand,
  CreateAuditEventArchiveCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ExportAuditEventsQuery,
  ExportGlobalAuditEventsQuery,
  ListAuditEventArchivesQuery,
  ListAuditEventLegalHoldsQuery,
  ListAuditEventsQuery,
  type ProductSessionAuthorizationPort,
  PruneAuditEventArchivesCommand,
  PruneAuditEventsCommand,
  type Query,
  type QueryBus,
  ReleaseAuditEventLegalHoldCommand,
  ShowAuditEventArchiveQuery,
  ShowAuditEventLegalHoldQuery,
  ShowAuditEventQuery,
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
      requestId: input.requestId ?? "req_orpc_audit_events_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

const testProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: {
        kind: "user",
        id: "usr_audit_http_test",
        label: "audit@example.com",
      },
      email: "audit@example.com",
      organizationId: "org_audit_http_test",
      role: input.requiredRole,
      userId: "usr_audit_http_test",
    }),
} satisfies ProductSessionAuthorizationPort;

const testProductSessionHeaders = {
  cookie: "better-auth.session_token=audit-http-test",
} as const;

describe("audit event HTTP routes", () => {
  test("[AUDIT-EVENT-ENTRY-002] dispatches shared audit event queries", async () => {
    const capturedQueries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQueries.push(query as Query<unknown>);
        if (query instanceof ListAuditEventsQuery) {
          return ok({
            schemaVersion: "audit-events.list/v1",
            items: [
              {
                auditEventId: "aud_res_1",
                aggregateId: "res_web",
                eventType: "resource-variable-set",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            generatedAt: "2026-01-01T00:00:10.000Z",
          } as T);
        }

        return ok({
          schemaVersion: "audit-events.show/v1",
          event: {
            auditEventId: "aud_res_1",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            payload: {
              value: "[redacted]",
            },
            redactedFields: ["value"],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: testProductSessionAuthorizationPort,
      queryBus,
    });

    const listResponse = await app.handle(
      new Request("http://localhost/api/audit-events?aggregateId=res_web", {
        headers: testProductSessionHeaders,
      }),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/audit-events/aud_res_1?aggregateId=res_web", {
        headers: testProductSessionHeaders,
      }),
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      schemaVersion: "audit-events.list/v1",
      items: [
        {
          auditEventId: "aud_res_1",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
    expect(showResponse.status).toBe(200);
    expect(await showResponse.json()).toEqual({
      schemaVersion: "audit-events.show/v1",
      event: {
        auditEventId: "aud_res_1",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        payload: {
          value: "[redacted]",
        },
        redactedFields: ["value"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(capturedQueries[0]).toBeInstanceOf(ListAuditEventsQuery);
    expect(capturedQueries[1]).toBeInstanceOf(ShowAuditEventQuery);
  });

  test("[AUDIT-EVENT-PRUNE-004] dispatches shared audit prune command", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
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
    } as CommandBus;
    const queryBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: testProductSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/audit-events/prune", {
        method: "POST",
        headers: { ...testProductSessionHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          before: "2026-01-01T00:05:00.000Z",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          dryRun: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
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
    });
    expect(capturedCommand).toBeInstanceOf(PruneAuditEventsCommand);
    expect(capturedCommand).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      dryRun: false,
    });
  });

  test("[AUDIT-EVENT-EXPORT-003] dispatches shared audit export query", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "audit-events.export/v1",
          aggregateId: "res_web",
          filters: {
            eventType: "resource-variable-set",
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-01-01T00:02:00.000Z",
            limit: 10,
            order: "asc",
          },
          items: [
            {
              auditEventId: "aud_res_1",
              aggregateId: "res_web",
              eventType: "resource-variable-set",
              payload: {
                value: "[redacted]",
              },
              redactedFields: ["value"],
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          itemCount: 1,
          truncated: false,
          generatedAt: "2026-01-01T00:02:00.000Z",
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: testProductSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/audit-events/export?aggregateId=res_web&eventType=resource-variable-set&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-01T00%3A02%3A00.000Z&limit=10",
        {
          headers: testProductSessionHeaders,
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "audit-events.export/v1",
      aggregateId: "res_web",
      filters: {
        eventType: "resource-variable-set",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:02:00.000Z",
        limit: 10,
      },
      items: [
        {
          auditEventId: "aud_res_1",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          payload: {
            value: "[redacted]",
          },
          redactedFields: ["value"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      itemCount: 1,
      truncated: false,
      generatedAt: "2026-01-01T00:02:00.000Z",
    });
    expect(capturedQuery).toBeInstanceOf(ExportAuditEventsQuery);
    expect(capturedQuery).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:02:00.000Z",
      limit: 10,
    });
  });

  test("[AUDIT-EVENT-GLOBAL-EXPORT-004] dispatches shared global audit export query", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "audit-events.export-global/v1",
          filters: {
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-01-01T00:02:00.000Z",
            limit: 10,
            order: "asc",
          },
          items: [
            {
              auditEventId: "aud_res_1",
              aggregateId: "res_web",
              eventType: "resource-variable-set",
              payload: {
                value: "[redacted]",
              },
              redactedFields: ["value"],
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          itemCount: 1,
          truncated: false,
          generatedAt: "2026-01-01T00:02:00.000Z",
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: testProductSessionAuthorizationPort,
      queryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/audit-events/export-global?aggregateId=res_web&eventType=resource-variable-set&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-01T00%3A02%3A00.000Z&limit=10",
        {
          headers: testProductSessionHeaders,
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "audit-events.export-global/v1",
      filters: {
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:02:00.000Z",
        limit: 10,
        order: "asc",
      },
      items: [
        {
          auditEventId: "aud_res_1",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          payload: {
            value: "[redacted]",
          },
          redactedFields: ["value"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      itemCount: 1,
      truncated: false,
      generatedAt: "2026-01-01T00:02:00.000Z",
    });
    expect(capturedQuery).toBeInstanceOf(ExportGlobalAuditEventsQuery);
    expect(capturedQuery).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:02:00.000Z",
      limit: 10,
      order: "asc",
    });
  });

  test("[AUDIT-EVENT-HOLD-006] dispatches shared audit legal hold commands and queries", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const capturedQueries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommands.push(command as Command<unknown>);
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
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQueries.push(query as Query<unknown>);
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
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: testProductSessionAuthorizationPort,
      queryBus,
    });

    const configureResponse = await app.handle(
      new Request("http://localhost/api/audit-events/legal-holds", {
        method: "POST",
        headers: { ...testProductSessionHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          reason: "support incident",
          requestedBy: "operator@example.com",
        }),
      }),
    );
    const listResponse = await app.handle(
      new Request(
        "http://localhost/api/audit-events/legal-holds?status=active&aggregateId=res_web",
        {
          headers: testProductSessionHeaders,
        },
      ),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/audit-events/legal-holds/ahl_support", {
        headers: testProductSessionHeaders,
      }),
    );
    const releaseResponse = await app.handle(
      new Request("http://localhost/api/audit-events/legal-holds/ahl_support/release", {
        method: "POST",
        headers: { ...testProductSessionHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          holdId: "ahl_support",
          releaseReason: "case closed",
          releasedBy: "operator@example.com",
        }),
      }),
    );

    expect(configureResponse.status).toBe(200);
    expect(listResponse.status).toBe(200);
    expect(showResponse.status).toBe(200);
    expect(releaseResponse.status).toBe(200);
    expect(capturedCommands[0]).toBeInstanceOf(ConfigureAuditEventLegalHoldCommand);
    expect(capturedCommands[0]).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      reason: "support incident",
      requestedBy: "operator@example.com",
    });
    expect(capturedQueries[0]).toBeInstanceOf(ListAuditEventLegalHoldsQuery);
    expect(capturedQueries[0]).toMatchObject({
      status: "active",
      aggregateId: "res_web",
    });
    expect(capturedQueries[1]).toBeInstanceOf(ShowAuditEventLegalHoldQuery);
    expect(capturedQueries[1]).toMatchObject({ holdId: "ahl_support" });
    expect(capturedCommands[1]).toBeInstanceOf(ReleaseAuditEventLegalHoldCommand);
    expect(capturedCommands[1]).toMatchObject({
      holdId: "ahl_support",
      releaseReason: "case closed",
      releasedBy: "operator@example.com",
    });
  });

  test("[AUDIT-EVENT-ARCHIVE-006] dispatches shared audit archive commands and queries", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const capturedQueries: Query<unknown>[] = [];
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
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommands.push(command as Command<unknown>);
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
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQueries.push(query as Query<unknown>);
        if (query instanceof ShowAuditEventArchiveQuery) {
          return ok({
            schemaVersion: "audit-events.archives.show/v1",
            archive: {
              ...archiveSummary,
              items: [
                {
                  auditEventId: "aud_res_1",
                  aggregateId: "res_web",
                  eventType: "resource-variable-set",
                  payload: { value: "[redacted]" },
                  redactedFields: ["value"],
                  createdAt: "2026-01-01T00:00:00.000Z",
                },
              ],
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
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: testProductSessionAuthorizationPort,
      queryBus,
    });

    const createResponse = await app.handle(
      new Request("http://localhost/api/audit-events/archives", {
        method: "POST",
        headers: { ...testProductSessionHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          reason: "support incident",
          retainSourceRows: true,
        }),
      }),
    );
    const listResponse = await app.handle(
      new Request("http://localhost/api/audit-events/archives?aggregateId=res_web", {
        headers: testProductSessionHeaders,
      }),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/audit-events/archives/aar_support", {
        headers: testProductSessionHeaders,
      }),
    );
    const pruneResponse = await app.handle(
      new Request("http://localhost/api/audit-events/archives/prune", {
        method: "POST",
        headers: { ...testProductSessionHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          before: "2026-01-01T00:20:00.000Z",
          dryRun: false,
        }),
      }),
    );

    expect(createResponse.status).toBe(200);
    expect(listResponse.status).toBe(200);
    expect(showResponse.status).toBe(200);
    expect(pruneResponse.status).toBe(200);
    expect(capturedCommands[0]).toBeInstanceOf(CreateAuditEventArchiveCommand);
    expect(capturedCommands[0]).toMatchObject({
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      reason: "support incident",
      retainSourceRows: true,
    });
    expect(capturedQueries[0]).toBeInstanceOf(ListAuditEventArchivesQuery);
    expect(capturedQueries[0]).toMatchObject({ aggregateId: "res_web" });
    expect(capturedQueries[1]).toBeInstanceOf(ShowAuditEventArchiveQuery);
    expect(capturedQueries[1]).toMatchObject({ archiveId: "aar_support" });
    expect(capturedCommands[1]).toBeInstanceOf(PruneAuditEventArchivesCommand);
    expect(capturedCommands[1]).toMatchObject({
      before: "2026-01-01T00:20:00.000Z",
      dryRun: false,
    });
  });
});
