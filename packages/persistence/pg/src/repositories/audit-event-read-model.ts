import {
  type AuditEventDetail,
  type AuditEventExportInput,
  type AuditEventExportPage,
  type AuditEventGlobalExportInput,
  type AuditEventListInput,
  type AuditEventListPage,
  type AuditEventPayloadValue,
  type AuditEventPruneInput,
  type AuditEventPruneStoreResult,
  type AuditEventReadModel,
  type AuditEventRecorder,
  type AuditEventRecordInput,
  type AuditEventRetentionStore,
  type AuditEventShowInput,
  type AuditEventSummary,
  type RepositoryContext,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type AuditLogsTable, type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type AuditLogRow = Selectable<AuditLogsTable>;
type AuditEventLegalHoldRow = Selectable<Database["audit_event_legal_holds"]>;

const sensitivePayloadKeyPattern =
  /(authorization|certificate|credential|env|password|payload|private|secret|signature|token|value)/i;

export class PgAuditEventReadModel
  implements AuditEventReadModel, AuditEventRetentionStore, AuditEventRecorder
{
  constructor(private readonly db: Kysely<Database>) {}

  async record(context: RepositoryContext, input: AuditEventRecordInput): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    await executor
      .insertInto("audit_logs")
      .values({
        id: input.id,
        aggregate_id: input.aggregateId,
        event_type: input.eventType,
        payload: input.payload,
        created_at: input.createdAt,
      })
      .execute();

    return ok(undefined);
  }

  async list(context: RepositoryContext, input: AuditEventListInput): Promise<AuditEventListPage> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const limit = input.limit ?? 50;
    let query = executor
      .selectFrom("audit_logs")
      .select(["id", "aggregate_id", "event_type", "created_at"])
      .where("aggregate_id", "=", input.aggregateId)
      .limit(limit + 1);

    if (input.eventType) {
      query = query.where("event_type", "=", input.eventType);
    }

    if (input.cursor) {
      query = query.where("created_at", "<", input.cursor);
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? pageRows.at(-1)?.created_at : undefined;

    return {
      items: pageRows.map((row) => ({
        auditEventId: row.id,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        createdAt: serializeTimestamp(row.created_at),
      })),
      ...(nextCursor ? { nextCursor: serializeTimestamp(nextCursor) } : {}),
    };
  }

  async export(
    context: RepositoryContext,
    input: AuditEventExportInput,
  ): Promise<AuditEventExportPage> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const limit = input.limit ?? 100;
    let query = executor
      .selectFrom("audit_logs")
      .selectAll()
      .where("aggregate_id", "=", input.aggregateId)
      .limit(limit + 1);

    if (input.eventType) {
      query = query.where("event_type", "=", input.eventType);
    }

    if (input.from) {
      query = query.where("created_at", ">=", input.from);
    }

    if (input.to) {
      query = query.where("created_at", "<", input.to);
    }

    const rows = await query.orderBy("created_at", "asc").execute();
    const pageRows = rows.slice(0, limit);

    return {
      items: pageRows.map(detailFromRow),
      truncated: rows.length > limit,
    };
  }

  async exportGlobal(
    context: RepositoryContext,
    input: AuditEventGlobalExportInput,
  ): Promise<AuditEventExportPage> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const limit = input.limit ?? 100;
    let query = executor
      .selectFrom("audit_logs")
      .selectAll()
      .where("created_at", ">=", input.from)
      .where("created_at", "<", input.to)
      .limit(limit + 1);

    if (input.aggregateId) {
      query = query.where("aggregate_id", "=", input.aggregateId);
    }

    if (input.eventType) {
      query = query.where("event_type", "=", input.eventType);
    }

    if (input.organizationId) {
      query = query.where("payload", "@>", { organizationId: input.organizationId });
    }

    if (input.action) {
      query = query.where("payload", "@>", { action: input.action });
    }

    if (input.resourceType) {
      query = query.where("payload", "@>", { resourceType: input.resourceType });
    }

    if (input.actorId) {
      query = query.where("payload", "@>", { actorId: input.actorId });
    }

    const rows = await query.orderBy("created_at", "asc").orderBy("id", "asc").execute();
    const pageRows = rows.slice(0, limit);

    return {
      items: pageRows.map(detailFromRow),
      truncated: rows.length > limit,
    };
  }

  async prune(
    context: RepositoryContext,
    input: AuditEventPruneInput,
  ): Promise<Result<AuditEventPruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    let query = executor
      .selectFrom("audit_logs")
      .select(["id", "aggregate_id", "event_type", "created_at"])
      .where("created_at", "<", input.before);

    if (input.aggregateId) {
      query = query.where("aggregate_id", "=", input.aggregateId);
    }

    if (input.eventType) {
      query = query.where("event_type", "=", input.eventType);
    }

    const rows = await query.execute();
    const activeHolds = await executor
      .selectFrom("audit_event_legal_holds")
      .selectAll()
      .where("status", "=", "active")
      .execute();
    const rowsWithHoldState = rows.map((row) => ({
      row,
      holdIds: activeHolds
        .filter((hold) => legalHoldMatchesAuditRow(hold, row))
        .map((hold) => hold.id),
    }));
    const heldRows = rowsWithHoldState.filter((entry) => entry.holdIds.length > 0);
    const activeArchiveIds = await executor
      .selectFrom("audit_event_archives")
      .select("id")
      .where("retain_source_rows", "=", true)
      .execute();
    const activeArchiveItems =
      activeArchiveIds.length > 0
        ? await executor
            .selectFrom("audit_event_archive_items")
            .select(["archive_id", "audit_event_id"])
            .where(
              "archive_id",
              "in",
              activeArchiveIds.map((archive) => archive.id),
            )
            .execute()
        : [];
    const archiveIdsByAuditEventId = new Map<string, string[]>();
    for (const item of activeArchiveItems) {
      const existing = archiveIdsByAuditEventId.get(item.audit_event_id) ?? [];
      existing.push(item.archive_id);
      archiveIdsByAuditEventId.set(item.audit_event_id, existing);
    }
    const unheldRows = rowsWithHoldState.filter((entry) => entry.holdIds.length === 0);
    const rowsWithArchiveState = unheldRows.map((entry) => ({
      ...entry,
      archiveIds: archiveIdsByAuditEventId.get(entry.row.id) ?? [],
    }));
    const archiveRetainedRows = rowsWithArchiveState.filter((entry) => entry.archiveIds.length > 0);
    const prunableRows = rowsWithArchiveState.filter((entry) => entry.archiveIds.length === 0);
    const countsByEventType: Record<string, number> = {};
    const heldCountsByEventType: Record<string, number> = {};
    const archiveRetainedCountsByEventType: Record<string, number> = {};
    for (const { row } of prunableRows) {
      countsByEventType[row.event_type] = (countsByEventType[row.event_type] ?? 0) + 1;
    }
    for (const { row } of heldRows) {
      heldCountsByEventType[row.event_type] = (heldCountsByEventType[row.event_type] ?? 0) + 1;
    }
    for (const { row } of archiveRetainedRows) {
      archiveRetainedCountsByEventType[row.event_type] =
        (archiveRetainedCountsByEventType[row.event_type] ?? 0) + 1;
    }
    const activeHoldIds = [
      ...new Set(
        heldRows.flatMap((entry) => entry.holdIds).sort((left, right) => left.localeCompare(right)),
      ),
    ];
    const retainedArchiveIds = [
      ...new Set(
        archiveRetainedRows
          .flatMap((entry) => entry.archiveIds)
          .sort((left, right) => left.localeCompare(right)),
      ),
    ];

    if (!input.dryRun && prunableRows.length > 0) {
      await executor
        .deleteFrom("audit_logs")
        .where(
          "id",
          "in",
          prunableRows.map(({ row }) => row.id),
        )
        .execute();
    }

    return ok({
      matchedCount: rows.length,
      prunedCount: input.dryRun ? 0 : prunableRows.length,
      heldCount: heldRows.length,
      archiveRetainedCount: archiveRetainedRows.length,
      countsByEventType,
      heldCountsByEventType,
      archiveRetainedCountsByEventType,
      activeHoldIds,
      activeArchiveIds: retainedArchiveIds,
    });
  }

  async findOne(
    context: RepositoryContext,
    input: AuditEventShowInput,
  ): Promise<AuditEventDetail | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const row = await executor
      .selectFrom("audit_logs")
      .selectAll()
      .where("id", "=", input.auditEventId)
      .where("aggregate_id", "=", input.aggregateId)
      .executeTakeFirst();

    return row ? detailFromRow(row) : null;
  }
}

function detailFromRow(row: AuditLogRow): AuditEventDetail {
  const { payload, redactedFields } = redactPayload(row.payload);
  return {
    auditEventId: row.id,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload,
    redactedFields,
    createdAt: serializeTimestamp(row.created_at),
  };
}

function legalHoldMatchesAuditRow(
  hold: AuditEventLegalHoldRow,
  row: Pick<AuditLogRow, "aggregate_id" | "created_at" | "event_type">,
): boolean {
  if (hold.event_type && hold.event_type !== row.event_type) {
    return false;
  }

  if (hold.aggregate_id) {
    return hold.aggregate_id === row.aggregate_id;
  }

  if (!hold.from_time || !hold.to_time) {
    return false;
  }

  const createdAt = serializeTimestamp(row.created_at);
  return (
    createdAt >= serializeTimestamp(hold.from_time) && createdAt < serializeTimestamp(hold.to_time)
  );
}

function redactPayload(payload: Record<string, unknown>): {
  payload: Record<string, AuditEventPayloadValue>;
  redactedFields: string[];
} {
  const safePayload: Record<string, AuditEventPayloadValue> = {};
  const redactedFields: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (sensitivePayloadKeyPattern.test(key)) {
      safePayload[key] = "[redacted]";
      redactedFields.push(key);
      continue;
    }

    const safeValue = safeAuditPayloadValue(value);
    if (safeValue === undefined) {
      safePayload[key] = "[redacted]";
      redactedFields.push(key);
      continue;
    }

    safePayload[key] = safeValue;
  }

  return { payload: safePayload, redactedFields };
}

function safeAuditPayloadValue(value: unknown): AuditEventPayloadValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value) && value.every((item): item is string => typeof item === "string")) {
    return value;
  }

  return undefined;
}

export function auditEventSummaryFromRow(row: AuditLogRow): AuditEventSummary {
  return {
    auditEventId: row.id,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    createdAt: serializeTimestamp(row.created_at),
  };
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
