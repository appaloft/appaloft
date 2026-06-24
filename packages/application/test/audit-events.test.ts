import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AuditEventArchiveCreateInput,
  type AuditEventArchiveDetail,
  type AuditEventArchiveListInput,
  type AuditEventArchiveListPage,
  type AuditEventArchivePruneInput,
  type AuditEventArchivePruneStoreResult,
  type AuditEventArchiveRecord,
  type AuditEventArchiveStore,
  type AuditEventDetail,
  type AuditEventExportInput,
  type AuditEventExportPage,
  type AuditEventGlobalExportInput,
  type AuditEventLegalHoldConfigureInput,
  type AuditEventLegalHoldListInput,
  type AuditEventLegalHoldListPage,
  type AuditEventLegalHoldRecord,
  type AuditEventLegalHoldReleaseInput,
  type AuditEventLegalHoldStore,
  type AuditEventListInput,
  type AuditEventListPage,
  type AuditEventPruneInput,
  type AuditEventPruneStoreResult,
  type AuditEventReadModel,
  type AuditEventRetentionStore,
  type AuditEventShowInput,
  createExecutionContext,
  type IdGenerator,
  type RepositoryContext,
  toRepositoryContext,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { ConfigureAuditEventLegalHoldCommand } from "../src/operations/audit-events/configure-audit-event-legal-hold.command";
import { ConfigureAuditEventLegalHoldUseCase } from "../src/operations/audit-events/configure-audit-event-legal-hold.use-case";
import { CreateAuditEventArchiveCommand } from "../src/operations/audit-events/create-audit-event-archive.command";
import { CreateAuditEventArchiveUseCase } from "../src/operations/audit-events/create-audit-event-archive.use-case";
import { ExportAuditEventsQuery } from "../src/operations/audit-events/export-audit-events.query";
import { ExportAuditEventsQueryService } from "../src/operations/audit-events/export-audit-events.query-service";
import { ExportGlobalAuditEventsQuery } from "../src/operations/audit-events/export-global-audit-events.query";
import { ExportGlobalAuditEventsQueryService } from "../src/operations/audit-events/export-global-audit-events.query-service";
import { ListAuditEventArchivesQuery } from "../src/operations/audit-events/list-audit-event-archives.query";
import { ListAuditEventArchivesQueryService } from "../src/operations/audit-events/list-audit-event-archives.query-service";
import { ListAuditEventLegalHoldsQuery } from "../src/operations/audit-events/list-audit-event-legal-holds.query";
import { ListAuditEventLegalHoldsQueryService } from "../src/operations/audit-events/list-audit-event-legal-holds.query-service";
import { ListAuditEventsQuery } from "../src/operations/audit-events/list-audit-events.query";
import { ListAuditEventsQueryService } from "../src/operations/audit-events/list-audit-events.query-service";
import { PruneAuditEventArchivesCommand } from "../src/operations/audit-events/prune-audit-event-archives.command";
import { PruneAuditEventArchivesUseCase } from "../src/operations/audit-events/prune-audit-event-archives.use-case";
import { PruneAuditEventsCommand } from "../src/operations/audit-events/prune-audit-events.command";
import { PruneAuditEventsUseCase } from "../src/operations/audit-events/prune-audit-events.use-case";
import { ReleaseAuditEventLegalHoldCommand } from "../src/operations/audit-events/release-audit-event-legal-hold.command";
import { ReleaseAuditEventLegalHoldUseCase } from "../src/operations/audit-events/release-audit-event-legal-hold.use-case";
import { ShowAuditEventQuery } from "../src/operations/audit-events/show-audit-event.query";
import { ShowAuditEventQueryService } from "../src/operations/audit-events/show-audit-event.query-service";
import { ShowAuditEventArchiveQuery } from "../src/operations/audit-events/show-audit-event-archive.query";
import { ShowAuditEventArchiveQueryService } from "../src/operations/audit-events/show-audit-event-archive.query-service";
import { ShowAuditEventLegalHoldQuery } from "../src/operations/audit-events/show-audit-event-legal-hold.query";
import { ShowAuditEventLegalHoldQueryService } from "../src/operations/audit-events/show-audit-event-legal-hold.query-service";

class MemoryAuditEventReadModel implements AuditEventReadModel {
  readonly events: AuditEventDetail[] = [
    {
      auditEventId: "aud_res_1",
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      payload: {
        key: "DATABASE_URL",
        value: "[redacted]",
      },
      redactedFields: ["value"],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  async list(_context: RepositoryContext, input: AuditEventListInput): Promise<AuditEventListPage> {
    return {
      items: this.events
        .filter((event) => event.aggregateId === input.aggregateId)
        .filter((event) => !input.eventType || event.eventType === input.eventType)
        .slice(0, input.limit ?? 50)
        .map((event) => ({
          auditEventId: event.auditEventId,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          createdAt: event.createdAt,
        })),
    };
  }

  async findOne(
    _context: RepositoryContext,
    input: AuditEventShowInput,
  ): Promise<AuditEventDetail | null> {
    return (
      this.events.find(
        (event) =>
          event.auditEventId === input.auditEventId && event.aggregateId === input.aggregateId,
      ) ?? null
    );
  }

  async export(
    _context: RepositoryContext,
    input: AuditEventExportInput,
  ): Promise<AuditEventExportPage> {
    const limit = input.limit ?? 100;
    const rows = this.events
      .filter((event) => event.aggregateId === input.aggregateId)
      .filter((event) => !input.eventType || event.eventType === input.eventType)
      .filter((event) => !input.from || event.createdAt >= input.from)
      .filter((event) => !input.to || event.createdAt < input.to)
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      items: rows.slice(0, limit),
      truncated: rows.length > limit,
    };
  }

  async exportGlobal(
    _context: RepositoryContext,
    input: AuditEventGlobalExportInput,
  ): Promise<AuditEventExportPage> {
    const limit = input.limit ?? 100;
    const order = input.order ?? "asc";
    const cursor = input.cursor ? parseMemoryAuditEventCursor(input.cursor) : undefined;
    const rows = this.events
      .filter((event) => event.createdAt >= input.from)
      .filter((event) => event.createdAt < input.to)
      .filter((event) => {
        if (!cursor) {
          return true;
        }
        const timestampComparison = event.createdAt.localeCompare(cursor.createdAt);
        if (timestampComparison !== 0 || !cursor.auditEventId) {
          return order === "desc" ? timestampComparison < 0 : timestampComparison > 0;
        }
        const idComparison = event.auditEventId.localeCompare(cursor.auditEventId);
        return order === "desc" ? idComparison < 0 : idComparison > 0;
      })
      .filter((event) => !input.aggregateId || event.aggregateId === input.aggregateId)
      .filter((event) => !input.eventType || event.eventType === input.eventType)
      .filter(
        (event) =>
          !input.projectId ||
          event.aggregateId === input.projectId ||
          (event.payload && event.payload.projectId === input.projectId),
      )
      .toSorted((a, b) => {
        const timestampOrder =
          order === "desc"
            ? b.createdAt.localeCompare(a.createdAt)
            : a.createdAt.localeCompare(b.createdAt);
        if (timestampOrder !== 0) {
          return timestampOrder;
        }

        return order === "desc"
          ? b.auditEventId.localeCompare(a.auditEventId)
          : a.auditEventId.localeCompare(b.auditEventId);
      });
    const pageRows = rows.slice(0, limit);
    const nextCursorRow = rows.length > limit ? pageRows.at(-1) : undefined;

    return {
      items: pageRows,
      truncated: rows.length > limit,
      ...(nextCursorRow
        ? {
            nextCursor: `${nextCursorRow.createdAt}|${nextCursorRow.auditEventId}`,
          }
        : {}),
    };
  }
}

function parseMemoryAuditEventCursor(cursor: string): { createdAt: string; auditEventId?: string } {
  const [createdAt = cursor, auditEventId] = cursor.split("|", 2);
  return {
    createdAt,
    ...(auditEventId ? { auditEventId } : {}),
  };
}

class MemoryAuditEventRetentionStore implements AuditEventRetentionStore {
  readonly inputs: AuditEventPruneInput[] = [];

  constructor(
    private readonly events: AuditEventDetail[],
    private readonly archiveStore?: MemoryAuditEventArchiveStore,
  ) {}

  async prune(
    _context: RepositoryContext,
    input: AuditEventPruneInput,
  ): Promise<Result<AuditEventPruneStoreResult>> {
    this.inputs.push(input);
    const matched = this.events.filter(
      (event) =>
        event.createdAt < input.before &&
        (!input.aggregateId || event.aggregateId === input.aggregateId) &&
        (!input.eventType || event.eventType === input.eventType),
    );
    const activeArchives = this.archiveStore?.archives.filter(
      (archive) => archive.retainSourceRows,
    );
    const rowsWithArchiveState = matched.map((event) => ({
      event,
      archiveIds:
        activeArchives
          ?.filter((archive) =>
            archive.items.some((item) => item.auditEventId === event.auditEventId),
          )
          .map((archive) => archive.archiveId) ?? [],
    }));
    const archiveRetainedRows = rowsWithArchiveState.filter((entry) => entry.archiveIds.length > 0);
    const prunableRows = rowsWithArchiveState.filter((entry) => entry.archiveIds.length === 0);
    const countsByEventType: Record<string, number> = {};
    const archiveRetainedCountsByEventType: Record<string, number> = {};
    for (const { event } of prunableRows) {
      countsByEventType[event.eventType] = (countsByEventType[event.eventType] ?? 0) + 1;
    }
    for (const { event } of archiveRetainedRows) {
      archiveRetainedCountsByEventType[event.eventType] =
        (archiveRetainedCountsByEventType[event.eventType] ?? 0) + 1;
    }

    if (!input.dryRun) {
      for (const { event } of prunableRows) {
        const index = this.events.findIndex(
          (candidate) => candidate.auditEventId === event.auditEventId,
        );
        if (index >= 0) {
          this.events.splice(index, 1);
        }
      }
    }

    return ok({
      matchedCount: matched.length,
      prunedCount: input.dryRun ? 0 : prunableRows.length,
      heldCount: 0,
      archiveRetainedCount: archiveRetainedRows.length,
      countsByEventType,
      heldCountsByEventType: {},
      archiveRetainedCountsByEventType,
      activeHoldIds: [],
      activeArchiveIds: [
        ...new Set(
          archiveRetainedRows
            .flatMap((entry) => entry.archiveIds)
            .sort((left, right) => left.localeCompare(right)),
        ),
      ],
    });
  }
}

class FixedIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_fixed`;
  }
}

class MemoryAuditEventLegalHoldStore implements AuditEventLegalHoldStore {
  readonly holds: AuditEventLegalHoldRecord[] = [];

  async configure(
    _context: RepositoryContext,
    input: AuditEventLegalHoldConfigureInput,
  ): Promise<Result<AuditEventLegalHoldRecord>> {
    const hold: AuditEventLegalHoldRecord = {
      holdId: input.holdId,
      status: "active",
      scope: input.aggregateId
        ? {
            kind: "aggregate",
            aggregateId: input.aggregateId,
            ...(input.from ? { from: input.from } : {}),
            ...(input.to ? { to: input.to } : {}),
          }
        : {
            kind: "global-window",
            ...(input.from ? { from: input.from } : {}),
            ...(input.to ? { to: input.to } : {}),
          },
      ...(input.eventType ? { eventType: input.eventType } : {}),
      reason: input.reason,
      ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
      createdAt: input.createdAt,
    };
    this.holds.push(hold);
    return ok(hold);
  }

  async release(
    _context: RepositoryContext,
    input: AuditEventLegalHoldReleaseInput,
  ): Promise<Result<AuditEventLegalHoldRecord | null>> {
    const hold = this.holds.find((candidate) => candidate.holdId === input.holdId);
    if (!hold) {
      return ok(null);
    }

    if (hold.status === "released") {
      return ok(hold);
    }

    const released: AuditEventLegalHoldRecord = {
      ...hold,
      status: "released",
      releasedAt: input.releasedAt,
      releaseReason: input.releaseReason,
      ...(input.releasedBy ? { releasedBy: input.releasedBy } : {}),
    };
    this.holds.splice(this.holds.indexOf(hold), 1, released);
    return ok(released);
  }

  async list(
    _context: RepositoryContext,
    input: AuditEventLegalHoldListInput,
  ): Promise<Result<AuditEventLegalHoldListPage>> {
    return ok({
      items: this.holds
        .filter((hold) => !input.status || hold.status === input.status)
        .filter(
          (hold) =>
            !input.aggregateId ||
            (hold.scope.kind === "aggregate" && hold.scope.aggregateId === input.aggregateId),
        )
        .filter((hold) => !input.eventType || hold.eventType === input.eventType)
        .slice(0, input.limit ?? 50),
    });
  }

  async findOne(
    _context: RepositoryContext,
    holdId: string,
  ): Promise<Result<AuditEventLegalHoldRecord | null>> {
    return ok(this.holds.find((hold) => hold.holdId === holdId) ?? null);
  }
}

class MemoryAuditEventArchiveStore implements AuditEventArchiveStore {
  readonly archives: AuditEventArchiveDetail[] = [];

  async create(
    _context: RepositoryContext,
    input: AuditEventArchiveCreateInput,
  ): Promise<Result<AuditEventArchiveRecord>> {
    const archive: AuditEventArchiveDetail = {
      archiveId: input.archiveId,
      archiveSchemaVersion: "audit-events.archive/v1",
      source: input.source,
      ...(input.eventType ? { eventType: input.eventType } : {}),
      reason: input.reason,
      itemCount: input.items.length,
      truncated: input.truncated,
      contentDigest: input.contentDigest,
      retainSourceRows: input.retainSourceRows,
      createdAt: input.createdAt,
      items: input.items.map((item) => ({ ...item, payload: { ...item.payload } })),
    };
    this.archives.push(archive);
    const { items: _items, ...record } = archive;
    return ok(record);
  }

  async list(
    _context: RepositoryContext,
    input: AuditEventArchiveListInput,
  ): Promise<Result<AuditEventArchiveListPage>> {
    const limit = input.limit ?? 50;
    return ok({
      items: this.archives
        .filter(
          (archive) =>
            !input.aggregateId ||
            (archive.source.kind === "aggregate" &&
              archive.source.aggregateId === input.aggregateId) ||
            (archive.source.kind === "global-window" &&
              archive.source.aggregateId === input.aggregateId),
        )
        .filter((archive) => !input.eventType || archive.eventType === input.eventType)
        .filter((archive) => !input.from || archive.createdAt >= input.from)
        .filter((archive) => !input.to || archive.createdAt < input.to)
        .toSorted(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            left.archiveId.localeCompare(right.archiveId),
        )
        .slice(0, limit)
        .map(({ items: _items, ...archive }) => archive),
    });
  }

  async findOne(
    _context: RepositoryContext,
    archiveId: string,
  ): Promise<Result<AuditEventArchiveDetail | null>> {
    const archive = this.archives.find((candidate) => candidate.archiveId === archiveId);
    return ok(archive ? { ...archive, items: archive.items.map((item) => ({ ...item })) } : null);
  }

  async prune(
    _context: RepositoryContext,
    input: AuditEventArchivePruneInput,
  ): Promise<Result<AuditEventArchivePruneStoreResult>> {
    const matched = this.archives.filter(
      (archive) =>
        archive.createdAt < input.before &&
        (!input.aggregateId ||
          (archive.source.kind === "aggregate" &&
            archive.source.aggregateId === input.aggregateId) ||
          (archive.source.kind === "global-window" &&
            archive.source.aggregateId === input.aggregateId)) &&
        (!input.eventType || archive.eventType === input.eventType),
    );
    const countsBySourceKind: Record<string, number> = {};
    const countsByEventType: Record<string, number> = {};
    for (const archive of matched) {
      countsBySourceKind[archive.source.kind] = (countsBySourceKind[archive.source.kind] ?? 0) + 1;
      if (archive.eventType) {
        countsByEventType[archive.eventType] = (countsByEventType[archive.eventType] ?? 0) + 1;
      }
    }

    if (!input.dryRun) {
      for (const archive of matched) {
        const index = this.archives.findIndex(
          (candidate) => candidate.archiveId === archive.archiveId,
        );
        if (index >= 0) {
          this.archives.splice(index, 1);
        }
      }
    }

    return ok({
      matchedCount: matched.length,
      prunedCount: input.dryRun ? 0 : matched.length,
      countsBySourceKind,
      countsByEventType,
    });
  }
}

describe("audit event queries", () => {
  test("[AUDIT-EVENT-QRY-001] requires aggregate scope for list and show", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_scope_test",
      entrypoint: "system",
    });
    const readModel = new MemoryAuditEventReadModel();
    const list = new ListAuditEventsQueryService(
      readModel,
      new FixedClock("2026-01-01T00:00:10.000Z"),
    );
    const show = new ShowAuditEventQueryService(readModel);

    const listResult = await list.execute(context, ListAuditEventsQuery.create()._unsafeUnwrap());
    const showResult = await show.execute(
      context,
      ShowAuditEventQuery.create({ auditEventId: "aud_res_1" })._unsafeUnwrap(),
    );

    expect(listResult.isErr()).toBe(true);
    expect(listResult._unsafeUnwrapErr().code).toBe("audit_event_scope_required");
    expect(showResult.isErr()).toBe(true);
    expect(showResult._unsafeUnwrapErr().code).toBe("audit_event_scope_required");
  });

  test("[AUDIT-EVENT-QRY-002] lists and shows aggregate-scoped redacted audit events", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_read_test",
      entrypoint: "system",
    });
    const readModel = new MemoryAuditEventReadModel();
    const list = new ListAuditEventsQueryService(
      readModel,
      new FixedClock("2026-01-01T00:00:10.000Z"),
    );
    const show = new ShowAuditEventQueryService(readModel);

    const listResult = await list.execute(
      context,
      ListAuditEventsQuery.create({ aggregateId: "res_web" })._unsafeUnwrap(),
    );
    const showResult = await show.execute(
      context,
      ShowAuditEventQuery.create({
        auditEventId: "aud_res_1",
        aggregateId: "res_web",
      })._unsafeUnwrap(),
    );
    const missingResult = await show.execute(
      context,
      ShowAuditEventQuery.create({
        auditEventId: "aud_res_1",
        aggregateId: "res_other",
      })._unsafeUnwrap(),
    );

    expect(listResult.isOk()).toBe(true);
    expect(listResult._unsafeUnwrap()).toEqual({
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
    expect(showResult.isOk()).toBe(true);
    expect(showResult._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.show/v1",
      event: {
        auditEventId: "aud_res_1",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        payload: {
          key: "DATABASE_URL",
          value: "[redacted]",
        },
        redactedFields: ["value"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(missingResult.isErr()).toBe(true);
    expect(missingResult._unsafeUnwrapErr().code).toBe("audit_event_not_found");
  });

  test("[AUDIT-EVENT-EXPORT-001] exports aggregate-scoped redacted audit events with metadata", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_export_test",
      entrypoint: "system",
    });
    const readModel = new MemoryAuditEventReadModel();
    readModel.events.push({
      auditEventId: "aud_res_2",
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      payload: {
        key: "PORT",
        value: "[redacted]",
      },
      redactedFields: ["value"],
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    const service = new ExportAuditEventsQueryService(
      readModel,
      new FixedClock("2026-01-01T00:02:00.000Z"),
    );

    const missingScope = await service.execute(
      context,
      ExportAuditEventsQuery.create()._unsafeUnwrap(),
    );
    const exported = await service.execute(
      context,
      ExportAuditEventsQuery.create({
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:02:00.000Z",
        limit: 1,
      })._unsafeUnwrap(),
    );

    expect(missingScope.isErr()).toBe(true);
    expect(missingScope._unsafeUnwrapErr().code).toBe("audit_event_scope_required");
    expect(exported.isOk()).toBe(true);
    expect(exported._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.export/v1",
      aggregateId: "res_web",
      filters: {
        eventType: "resource-variable-set",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:02:00.000Z",
        limit: 1,
      },
      itemCount: 1,
      items: [
        {
          auditEventId: "aud_res_1",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          payload: {
            key: "DATABASE_URL",
            value: "[redacted]",
          },
          redactedFields: ["value"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      truncated: true,
      generatedAt: "2026-01-01T00:02:00.000Z",
    });
  });

  test("[AUDIT-EVENT-GLOBAL-EXPORT-001][AUDIT-EVENT-GLOBAL-EXPORT-002] exports global audit events with required window and metadata", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_global_export_test",
      entrypoint: "system",
    });
    const readModel = new MemoryAuditEventReadModel();
    readModel.events.push(
      {
        auditEventId: "aud_srv_1",
        aggregateId: "srv_primary",
        eventType: "server-renamed",
        payload: {
          name: "Primary",
        },
        redactedFields: [],
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      {
        auditEventId: "aud_res_2",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        payload: {
          key: "PORT",
          value: "[redacted]",
          projectId: "prj_web",
        },
        redactedFields: ["value"],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    );
    const service = new ExportGlobalAuditEventsQueryService(
      readModel,
      new FixedClock("2026-01-01T00:03:00.000Z"),
    );

    const missingWindow = ExportGlobalAuditEventsQuery.create({
      from: "2026-01-01T00:00:00.000Z",
    } as unknown as Parameters<typeof ExportGlobalAuditEventsQuery.create>[0]);
    const exported = await service.execute(
      context,
      ExportGlobalAuditEventsQuery.create({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        limit: 2,
      })._unsafeUnwrap(),
    );

    expect(missingWindow.isErr()).toBe(true);
    expect(missingWindow._unsafeUnwrapErr().code).toBe("validation_error");
    expect(exported.isOk()).toBe(true);
    expect(exported._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.export-global/v1",
      filters: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        limit: 2,
        order: "asc",
      },
      itemCount: 2,
      items: [
        {
          auditEventId: "aud_res_1",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          payload: {
            key: "DATABASE_URL",
            value: "[redacted]",
          },
          redactedFields: ["value"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          auditEventId: "aud_srv_1",
          aggregateId: "srv_primary",
          eventType: "server-renamed",
          payload: {
            name: "Primary",
          },
          redactedFields: [],
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      ],
      nextCursor: "2026-01-01T00:01:00.000Z|aud_srv_1",
      truncated: true,
      generatedAt: "2026-01-01T00:03:00.000Z",
    });

    const nextPage = await service.execute(
      context,
      ExportGlobalAuditEventsQuery.create({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        limit: 1,
        order: "desc",
        cursor: "2026-01-01T00:02:00.000Z",
      })._unsafeUnwrap(),
    );
    expect(nextPage.isOk()).toBe(true);
    expect(nextPage._unsafeUnwrap()).toMatchObject({
      filters: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        limit: 1,
        order: "desc",
        cursor: "2026-01-01T00:02:00.000Z",
      },
      items: [
        expect.objectContaining({
          auditEventId: "aud_srv_1",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
      truncated: true,
    });

    const projectScoped = await service.execute(
      context,
      ExportGlobalAuditEventsQuery.create({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        projectId: "prj_web",
        limit: 10,
      })._unsafeUnwrap(),
    );
    expect(projectScoped.isOk()).toBe(true);
    expect(projectScoped._unsafeUnwrap()).toMatchObject({
      filters: {
        projectId: "prj_web",
      },
      items: [expect.objectContaining({ auditEventId: "aud_res_2" })],
    });
  });

  test("[AUDIT-EVENT-PRUNE-001] dry-runs retained audit events by default", async () => {
    const readModel = new MemoryAuditEventReadModel();
    const retentionStore = new MemoryAuditEventRetentionStore(readModel.events);
    const useCase = new PruneAuditEventsUseCase(
      retentionStore,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_audit_event_prune_dry_run_test",
      entrypoint: "system",
    });
    const command = PruneAuditEventsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      matchedCount: 1,
      prunedCount: 0,
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
    expect(retentionStore.inputs).toEqual([
      {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      },
    ]);
    expect(readModel.events).toHaveLength(1);
  });

  test("[AUDIT-EVENT-PRUNE-002] destructive prune deletes only matching old audit rows", async () => {
    const readModel = new MemoryAuditEventReadModel();
    readModel.events.push({
      auditEventId: "aud_srv_1",
      aggregateId: "srv_primary",
      eventType: "server-renamed",
      payload: { name: "Primary" },
      redactedFields: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const retentionStore = new MemoryAuditEventRetentionStore(readModel.events);
    const useCase = new PruneAuditEventsUseCase(
      retentionStore,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_audit_event_prune_delete_test",
      entrypoint: "system",
    });
    const command = PruneAuditEventsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      aggregateId: "res_web",
      eventType: "resource-variable-set",
      dryRun: false,
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
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
    });
    expect(readModel.events.map((event) => event.auditEventId)).toEqual(["aud_srv_1"]);
  });

  test("[AUDIT-EVENT-ARCHIVE-001][AUDIT-EVENT-ARCHIVE-002] creates aggregate and bounded global archives", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_archive_create_test",
      entrypoint: "system",
    });
    const readModel = new MemoryAuditEventReadModel();
    readModel.events.push({
      auditEventId: "aud_srv_1",
      aggregateId: "srv_primary",
      eventType: "server-renamed",
      payload: { name: "Primary" },
      redactedFields: [],
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    const archiveStore = new MemoryAuditEventArchiveStore();
    const useCase = new CreateAuditEventArchiveUseCase(
      readModel,
      archiveStore,
      new FixedIdGenerator(),
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );

    const missingScope = await useCase.execute(
      context,
      new CreateAuditEventArchiveCommand("support incident", 100, false),
    );
    const aggregate = await useCase.execute(
      context,
      CreateAuditEventArchiveCommand.create({
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        reason: "support incident",
        retainSourceRows: true,
      })._unsafeUnwrap(),
    );
    const global = await useCase.execute(
      context,
      CreateAuditEventArchiveCommand.create({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:02:00.000Z",
        reason: "incident window",
        limit: 2,
      })._unsafeUnwrap(),
    );

    expect(missingScope.isErr()).toBe(true);
    expect(missingScope._unsafeUnwrapErr().code).toBe("audit_event_archive_scope_required");
    expect(aggregate.isOk()).toBe(true);
    expect(aggregate._unsafeUnwrap()).toMatchObject({
      schemaVersion: "audit-events.archives.archive/v1",
      archive: {
        archiveId: "aar_fixed",
        archiveSchemaVersion: "audit-events.archive/v1",
        source: { kind: "aggregate", aggregateId: "res_web" },
        eventType: "resource-variable-set",
        reason: "support incident",
        itemCount: 1,
        truncated: false,
        retainSourceRows: true,
        createdAt: "2026-01-01T00:10:00.000Z",
      },
    });
    expect(aggregate._unsafeUnwrap().archive.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(global.isOk()).toBe(true);
    expect(global._unsafeUnwrap()).toMatchObject({
      archive: {
        source: {
          kind: "global-window",
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:02:00.000Z",
        },
        itemCount: 2,
      },
    });
  });

  test("[AUDIT-EVENT-ARCHIVE-003] lists and shows immutable redacted archive readback", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_archive_readback_test",
      entrypoint: "system",
    });
    const archiveStore = new MemoryAuditEventArchiveStore();
    await archiveStore.create(toRepositoryContext(context), {
      archiveId: "aar_support",
      source: { kind: "aggregate", aggregateId: "res_web" },
      eventType: "resource-variable-set",
      reason: "support incident",
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
      truncated: false,
      contentDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      retainSourceRows: true,
      createdAt: "2026-01-01T00:10:00.000Z",
    });
    const list = new ListAuditEventArchivesQueryService(
      archiveStore,
      new FixedClock("2026-01-01T00:11:00.000Z"),
    );
    const show = new ShowAuditEventArchiveQueryService(
      archiveStore,
      new FixedClock("2026-01-01T00:11:00.000Z"),
    );

    const listed = await list.execute(
      context,
      ListAuditEventArchivesQuery.create({ aggregateId: "res_web" })._unsafeUnwrap(),
    );
    const shown = await show.execute(
      context,
      ShowAuditEventArchiveQuery.create({ archiveId: "aar_support" })._unsafeUnwrap(),
    );
    const missing = await show.execute(
      context,
      ShowAuditEventArchiveQuery.create({ archiveId: "aar_missing" })._unsafeUnwrap(),
    );

    expect(listed.isOk()).toBe(true);
    expect(listed._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.archives.list/v1",
      items: [
        {
          archiveId: "aar_support",
          archiveSchemaVersion: "audit-events.archive/v1",
          source: { kind: "aggregate", aggregateId: "res_web" },
          eventType: "resource-variable-set",
          reason: "support incident",
          itemCount: 1,
          truncated: false,
          contentDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          retainSourceRows: true,
          createdAt: "2026-01-01T00:10:00.000Z",
        },
      ],
      generatedAt: "2026-01-01T00:11:00.000Z",
    });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().archive.items).toEqual([
      {
        auditEventId: "aud_res_1",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        payload: { value: "[redacted]" },
        redactedFields: ["value"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(missing.isErr()).toBe(true);
    expect(missing._unsafeUnwrapErr().code).toBe("audit_event_archive_not_found");
  });

  test("[AUDIT-EVENT-ARCHIVE-004] archive prune is dry-run first and deletes only archives", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_archive_prune_test",
      entrypoint: "system",
    });
    const archiveStore = new MemoryAuditEventArchiveStore();
    await archiveStore.create(toRepositoryContext(context), {
      archiveId: "aar_old",
      source: { kind: "aggregate", aggregateId: "res_web" },
      reason: "old support case",
      items: [],
      truncated: false,
      contentDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      retainSourceRows: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const useCase = new PruneAuditEventArchivesUseCase(
      archiveStore,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );

    const dryRun = await useCase.execute(
      context,
      PruneAuditEventArchivesCommand.create({
        before: "2026-01-01T00:05:00.000Z",
      })._unsafeUnwrap(),
    );
    const destructive = await useCase.execute(
      context,
      PruneAuditEventArchivesCommand.create({
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      })._unsafeUnwrap(),
    );

    expect(dryRun.isOk()).toBe(true);
    expect(dryRun._unsafeUnwrap()).toMatchObject({
      schemaVersion: "audit-events.archives.prune/v1",
      dryRun: true,
      matchedCount: 1,
      prunedCount: 0,
      countsBySourceKind: { aggregate: 1 },
    });
    expect(destructive.isOk()).toBe(true);
    expect(destructive._unsafeUnwrap()).toMatchObject({
      dryRun: false,
      matchedCount: 1,
      prunedCount: 1,
    });
    expect(archiveStore.archives).toHaveLength(0);
  });

  test("[AUDIT-EVENT-ARCHIVE-005] audit prune skips archive-retained source rows", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_archive_retention_prune_test",
      entrypoint: "system",
    });
    const readModel = new MemoryAuditEventReadModel();
    readModel.events.push({
      auditEventId: "aud_srv_1",
      aggregateId: "srv_primary",
      eventType: "server-renamed",
      payload: { name: "Primary" },
      redactedFields: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const archiveStore = new MemoryAuditEventArchiveStore();
    const retainedEvent = readModel.events.find((event) => event.auditEventId === "aud_res_1");
    if (!retainedEvent) {
      throw new Error("expected retained audit event fixture");
    }
    await archiveStore.create(toRepositoryContext(context), {
      archiveId: "aar_retained",
      source: { kind: "aggregate", aggregateId: "res_web" },
      reason: "retain source row",
      items: [retainedEvent],
      truncated: false,
      contentDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      retainSourceRows: true,
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    const retentionStore = new MemoryAuditEventRetentionStore(readModel.events, archiveStore);
    const useCase = new PruneAuditEventsUseCase(
      retentionStore,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );

    const result = await useCase.execute(
      context,
      PruneAuditEventsCommand.create({
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      matchedCount: 2,
      prunedCount: 1,
      heldCount: 0,
      archiveRetainedCount: 1,
      countsByEventType: { "server-renamed": 1 },
      archiveRetainedCountsByEventType: { "resource-variable-set": 1 },
      activeArchiveIds: ["aar_retained"],
    });
    expect(readModel.events.map((event) => event.auditEventId)).toEqual(["aud_res_1"]);
  });

  test("[AUDIT-EVENT-HOLD-001][AUDIT-EVENT-HOLD-002] configures aggregate and bounded global legal holds", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_legal_hold_configure_test",
      entrypoint: "system",
    });
    const store = new MemoryAuditEventLegalHoldStore();
    const useCase = new ConfigureAuditEventLegalHoldUseCase(
      store,
      new FixedIdGenerator(),
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );

    const aggregate = await useCase.execute(
      context,
      ConfigureAuditEventLegalHoldCommand.create({
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        reason: "support incident",
        requestedBy: "operator@example.com",
      })._unsafeUnwrap(),
    );
    const global = await useCase.execute(
      context,
      ConfigureAuditEventLegalHoldCommand.create({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:05:00.000Z",
        reason: "incident window",
      })._unsafeUnwrap(),
    );

    expect(aggregate.isOk()).toBe(true);
    expect(aggregate._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.legal-holds.hold/v1",
      hold: {
        holdId: "ahl_fixed",
        status: "active",
        scope: {
          kind: "aggregate",
          aggregateId: "res_web",
        },
        eventType: "resource-variable-set",
        reason: "support incident",
        requestedBy: "operator@example.com",
        createdAt: "2026-01-01T00:10:00.000Z",
      },
    });
    expect(global.isOk()).toBe(true);
    expect(global._unsafeUnwrap().hold.scope).toEqual({
      kind: "global-window",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:05:00.000Z",
    });
  });

  test("[AUDIT-EVENT-HOLD-004][AUDIT-EVENT-HOLD-005] lists, shows, and releases safe legal hold readback", async () => {
    const context = createExecutionContext({
      requestId: "req_audit_event_legal_hold_readback_test",
      entrypoint: "system",
    });
    const store = new MemoryAuditEventLegalHoldStore();
    await store.configure(toRepositoryContext(context), {
      holdId: "ahl_support",
      aggregateId: "res_web",
      reason: "support incident",
      requestedBy: "operator@example.com",
      createdAt: "2026-01-01T00:10:00.000Z",
    });
    const list = new ListAuditEventLegalHoldsQueryService(
      store,
      new FixedClock("2026-01-01T00:11:00.000Z"),
    );
    const show = new ShowAuditEventLegalHoldQueryService(
      store,
      new FixedClock("2026-01-01T00:11:00.000Z"),
    );
    const release = new ReleaseAuditEventLegalHoldUseCase(
      store,
      new FixedClock("2026-01-01T00:12:00.000Z"),
    );

    const listed = await list.execute(
      context,
      ListAuditEventLegalHoldsQuery.create({
        status: "active",
        aggregateId: "res_web",
      })._unsafeUnwrap(),
    );
    const shown = await show.execute(
      context,
      ShowAuditEventLegalHoldQuery.create({ holdId: "ahl_support" })._unsafeUnwrap(),
    );
    const released = await release.execute(
      context,
      ReleaseAuditEventLegalHoldCommand.create({
        holdId: "ahl_support",
        releaseReason: "case closed",
        releasedBy: "operator@example.com",
      })._unsafeUnwrap(),
    );

    expect(listed.isOk()).toBe(true);
    expect(listed._unsafeUnwrap()).toEqual({
      schemaVersion: "audit-events.legal-holds.list/v1",
      items: [
        {
          holdId: "ahl_support",
          status: "active",
          scope: {
            kind: "aggregate",
            aggregateId: "res_web",
          },
          reason: "support incident",
          requestedBy: "operator@example.com",
          createdAt: "2026-01-01T00:10:00.000Z",
        },
      ],
      generatedAt: "2026-01-01T00:11:00.000Z",
    });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().hold).toMatchObject({ holdId: "ahl_support" });
    expect(released.isOk()).toBe(true);
    expect(released._unsafeUnwrap().hold).toMatchObject({
      holdId: "ahl_support",
      status: "released",
      releasedAt: "2026-01-01T00:12:00.000Z",
      releaseReason: "case closed",
      releasedBy: "operator@example.com",
    });
  });
});
