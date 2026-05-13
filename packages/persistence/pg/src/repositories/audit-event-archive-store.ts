import {
  type AuditEventArchiveCreateInput,
  type AuditEventArchiveDetail,
  type AuditEventArchiveListInput,
  type AuditEventArchiveListPage,
  type AuditEventArchivePruneInput,
  type AuditEventArchivePruneStoreResult,
  type AuditEventArchiveRecord,
  type AuditEventArchiveSourceSelection,
  type AuditEventArchiveStore,
  type AuditEventDetail,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import {
  type AuditEventArchiveItemsTable,
  type AuditEventArchivesTable,
  type Database,
} from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type ArchiveRow = Selectable<AuditEventArchivesTable>;
type ArchiveItemRow = Selectable<AuditEventArchiveItemsTable>;

export class PgAuditEventArchiveStore implements AuditEventArchiveStore {
  constructor(private readonly db: Kysely<Database>) {}

  async create(
    context: RepositoryContext,
    input: AuditEventArchiveCreateInput,
  ): Promise<Result<AuditEventArchiveRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      await executor.transaction().execute(async (trx) => {
        await trx
          .insertInto("audit_event_archives")
          .values({
            id: input.archiveId,
            archive_schema_version: "audit-events.archive/v1",
            source_kind: input.source.kind,
            aggregate_id: aggregateIdFromSource(input.source),
            event_type: input.eventType ?? null,
            from_time: input.source.from ?? null,
            to_time: input.source.to ?? null,
            source: sourceToJson(input.source),
            reason: input.reason,
            item_count: input.items.length,
            truncated: input.truncated,
            content_digest: input.contentDigest,
            retain_source_rows: input.retainSourceRows,
            created_at: input.createdAt,
          })
          .execute();

        if (input.items.length > 0) {
          await trx
            .insertInto("audit_event_archive_items")
            .values(
              input.items.map((item) => ({
                archive_id: input.archiveId,
                audit_event_id: item.auditEventId,
                aggregate_id: item.aggregateId,
                event_type: item.eventType,
                created_at: item.createdAt,
                item: itemToJson(item),
              })),
            )
            .execute();
        }
      });

      const archive = await this.findOne(context, input.archiveId);
      if (archive.isErr()) {
        return err(archive.error);
      }

      return archive.value ? ok(recordFromDetail(archive.value)) : ok(recordFromInput(input));
    } catch (error) {
      return err(infraError(error, "audit-event-archive-create"));
    }
  }

  async list(
    context: RepositoryContext,
    input: AuditEventArchiveListInput,
  ): Promise<Result<AuditEventArchiveListPage>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const limit = input.limit ?? 50;
      let query = executor
        .selectFrom("audit_event_archives")
        .selectAll()
        .limit(limit + 1);

      if (input.aggregateId) {
        query = query.where("aggregate_id", "=", input.aggregateId);
      }

      if (input.eventType) {
        query = query.where("event_type", "=", input.eventType);
      }

      if (input.from) {
        query = query.where("created_at", ">=", input.from);
      }

      if (input.to) {
        query = query.where("created_at", "<", input.to);
      }

      if (input.cursor) {
        query = query.where("created_at", "<", input.cursor);
      }

      const rows = await query.orderBy("created_at", "desc").orderBy("id", "asc").execute();
      const pageRows = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? pageRows.at(-1)?.created_at : undefined;

      return ok({
        items: pageRows.map(recordFromRow),
        ...(nextCursor ? { nextCursor: serializeTimestamp(nextCursor) } : {}),
      });
    } catch (error) {
      return err(infraError(error, "audit-event-archive-list"));
    }
  }

  async findOne(
    context: RepositoryContext,
    archiveId: string,
  ): Promise<Result<AuditEventArchiveDetail | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const row = await executor
        .selectFrom("audit_event_archives")
        .selectAll()
        .where("id", "=", archiveId)
        .executeTakeFirst();

      if (!row) {
        return ok(null);
      }

      const itemRows = await executor
        .selectFrom("audit_event_archive_items")
        .selectAll()
        .where("archive_id", "=", archiveId)
        .orderBy("created_at", "asc")
        .orderBy("audit_event_id", "asc")
        .execute();

      return ok({
        ...recordFromRow(row),
        items: itemRows.map(itemFromRow),
      });
    } catch (error) {
      return err(infraError(error, "audit-event-archive-show"));
    }
  }

  async prune(
    context: RepositoryContext,
    input: AuditEventArchivePruneInput,
  ): Promise<Result<AuditEventArchivePruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("audit_event_archives")
        .select(["id", "source_kind", "event_type"])
        .where("created_at", "<", input.before);

      if (input.aggregateId) {
        query = query.where("aggregate_id", "=", input.aggregateId);
      }

      if (input.eventType) {
        query = query.where("event_type", "=", input.eventType);
      }

      const rows = await query.execute();
      const countsBySourceKind: Record<string, number> = {};
      const countsByEventType: Record<string, number> = {};
      for (const row of rows) {
        countsBySourceKind[row.source_kind] = (countsBySourceKind[row.source_kind] ?? 0) + 1;
        if (row.event_type) {
          countsByEventType[row.event_type] = (countsByEventType[row.event_type] ?? 0) + 1;
        }
      }

      if (!input.dryRun && rows.length > 0) {
        await executor
          .deleteFrom("audit_event_archives")
          .where(
            "id",
            "in",
            rows.map((row) => row.id),
          )
          .execute();
      }

      return ok({
        matchedCount: rows.length,
        prunedCount: input.dryRun ? 0 : rows.length,
        countsBySourceKind,
        countsByEventType,
      });
    } catch (error) {
      return err(infraError(error, "audit-event-archive-prune"));
    }
  }
}

function recordFromRow(row: ArchiveRow): AuditEventArchiveRecord {
  return {
    archiveId: row.id,
    archiveSchemaVersion: "audit-events.archive/v1",
    source: sourceFromRow(row),
    ...(row.event_type ? { eventType: row.event_type } : {}),
    reason: row.reason,
    itemCount: row.item_count,
    truncated: row.truncated,
    contentDigest: row.content_digest,
    retainSourceRows: row.retain_source_rows,
    createdAt: serializeTimestamp(row.created_at),
  };
}

function recordFromDetail(detail: AuditEventArchiveDetail): AuditEventArchiveRecord {
  const { items: _items, ...record } = detail;
  return record;
}

function recordFromInput(input: AuditEventArchiveCreateInput): AuditEventArchiveRecord {
  return {
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
  };
}

function sourceFromRow(row: ArchiveRow): AuditEventArchiveSourceSelection {
  if (row.source_kind === "aggregate") {
    return {
      kind: "aggregate",
      aggregateId: row.aggregate_id ?? "",
      ...(row.from_time ? { from: serializeTimestamp(row.from_time) } : {}),
      ...(row.to_time ? { to: serializeTimestamp(row.to_time) } : {}),
    };
  }

  return {
    kind: "global-window",
    from: row.from_time ? serializeTimestamp(row.from_time) : "",
    to: row.to_time ? serializeTimestamp(row.to_time) : "",
    ...(row.aggregate_id ? { aggregateId: row.aggregate_id } : {}),
  };
}

function aggregateIdFromSource(source: AuditEventArchiveSourceSelection): string | null {
  return source.kind === "aggregate" ? source.aggregateId : (source.aggregateId ?? null);
}

function sourceToJson(source: AuditEventArchiveSourceSelection) {
  return {
    kind: source.kind,
    ...(source.kind === "aggregate" ? { aggregateId: source.aggregateId } : {}),
    ...(source.kind === "global-window" && source.aggregateId
      ? { aggregateId: source.aggregateId }
      : {}),
    ...(source.from ? { from: source.from } : {}),
    ...(source.to ? { to: source.to } : {}),
  };
}

function itemToJson(item: AuditEventDetail) {
  return {
    auditEventId: item.auditEventId,
    aggregateId: item.aggregateId,
    eventType: item.eventType,
    payload: item.payload,
    redactedFields: item.redactedFields,
    createdAt: item.createdAt,
  };
}

function itemFromRow(row: ArchiveItemRow): AuditEventDetail {
  return {
    auditEventId: row.item.auditEventId,
    aggregateId: row.item.aggregateId,
    eventType: row.item.eventType,
    payload: row.item.payload,
    redactedFields: row.item.redactedFields,
    createdAt: row.item.createdAt,
  };
}

function infraError(error: unknown, phase: string) {
  return domainError.infra("Audit event archive store operation failed", {
    phase,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
