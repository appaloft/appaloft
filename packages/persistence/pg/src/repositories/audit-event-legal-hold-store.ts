import {
  type AuditEventLegalHoldConfigureInput,
  type AuditEventLegalHoldListInput,
  type AuditEventLegalHoldListPage,
  type AuditEventLegalHoldRecord,
  type AuditEventLegalHoldReleaseInput,
  type AuditEventLegalHoldStatus,
  type AuditEventLegalHoldStore,
  type RepositoryContext,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type AuditEventLegalHoldRow = Selectable<Database["audit_event_legal_holds"]>;

export class PgAuditEventLegalHoldStore implements AuditEventLegalHoldStore {
  constructor(private readonly db: Kysely<Database>) {}

  async configure(
    context: RepositoryContext,
    input: AuditEventLegalHoldConfigureInput,
  ): Promise<Result<AuditEventLegalHoldRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    await executor
      .insertInto("audit_event_legal_holds")
      .values({
        id: input.holdId,
        status: "active",
        aggregate_id: input.aggregateId ?? null,
        event_type: input.eventType ?? null,
        from_time: input.from ?? null,
        to_time: input.to ?? null,
        reason: input.reason,
        requested_by: input.requestedBy ?? null,
        created_at: input.createdAt,
        released_at: null,
        release_reason: null,
        released_by: null,
      })
      .execute();

    const record = await this.findOne(context, input.holdId);
    if (record.isErr()) {
      return ok(legalHoldFromInput(input));
    }

    return record.value ? ok(record.value) : ok(legalHoldFromInput(input));
  }

  async release(
    context: RepositoryContext,
    input: AuditEventLegalHoldReleaseInput,
  ): Promise<Result<AuditEventLegalHoldRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const existing = await this.findOne(context, input.holdId);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    if (existing.value.status === "released") {
      return ok(existing.value);
    }

    await executor
      .updateTable("audit_event_legal_holds")
      .set({
        status: "released",
        released_at: input.releasedAt,
        release_reason: input.releaseReason,
        released_by: input.releasedBy ?? null,
      })
      .where("id", "=", input.holdId)
      .execute();

    return this.findOne(context, input.holdId);
  }

  async list(
    context: RepositoryContext,
    input: AuditEventLegalHoldListInput,
  ): Promise<Result<AuditEventLegalHoldListPage>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const limit = input.limit ?? 50;
    let query = executor
      .selectFrom("audit_event_legal_holds")
      .selectAll()
      .limit(limit + 1);

    if (input.status) {
      query = query.where("status", "=", input.status);
    }

    if (input.aggregateId) {
      query = query.where("aggregate_id", "=", input.aggregateId);
    }

    if (input.eventType) {
      query = query.where("event_type", "=", input.eventType);
    }

    if (input.cursor) {
      query = query.where("created_at", "<", input.cursor);
    }

    const rows = await query.orderBy("created_at", "desc").orderBy("id", "asc").execute();
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? pageRows.at(-1)?.created_at : undefined;

    return ok({
      items: pageRows.map(legalHoldFromRow),
      ...(nextCursor ? { nextCursor: serializeTimestamp(nextCursor) } : {}),
    });
  }

  async findOne(
    context: RepositoryContext,
    holdId: string,
  ): Promise<Result<AuditEventLegalHoldRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const row = await executor
      .selectFrom("audit_event_legal_holds")
      .selectAll()
      .where("id", "=", holdId)
      .executeTakeFirst();

    return ok(row ? legalHoldFromRow(row) : null);
  }
}

function legalHoldFromRow(row: AuditEventLegalHoldRow): AuditEventLegalHoldRecord {
  return {
    holdId: row.id,
    status: legalHoldStatus(row.status),
    scope: row.aggregate_id
      ? {
          kind: "aggregate",
          aggregateId: row.aggregate_id,
          ...(row.from_time ? { from: serializeTimestamp(row.from_time) } : {}),
          ...(row.to_time ? { to: serializeTimestamp(row.to_time) } : {}),
        }
      : {
          kind: "global-window",
          ...(row.from_time ? { from: serializeTimestamp(row.from_time) } : {}),
          ...(row.to_time ? { to: serializeTimestamp(row.to_time) } : {}),
        },
    ...(row.event_type ? { eventType: row.event_type } : {}),
    reason: row.reason,
    ...(row.requested_by ? { requestedBy: row.requested_by } : {}),
    createdAt: serializeTimestamp(row.created_at),
    ...(row.released_at ? { releasedAt: serializeTimestamp(row.released_at) } : {}),
    ...(row.release_reason ? { releaseReason: row.release_reason } : {}),
    ...(row.released_by ? { releasedBy: row.released_by } : {}),
  };
}

function legalHoldFromInput(input: AuditEventLegalHoldConfigureInput): AuditEventLegalHoldRecord {
  return {
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
}

function legalHoldStatus(status: string): AuditEventLegalHoldStatus {
  return status === "released" ? "released" : "active";
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
