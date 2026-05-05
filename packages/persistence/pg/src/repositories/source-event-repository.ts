import {
  type RepositoryContext,
  type SourceEventDedupeStatus,
  type SourceEventDetail,
  type SourceEventIgnoredReason,
  type SourceEventKind,
  type SourceEventListInput,
  type SourceEventListItem,
  type SourceEventListPage,
  type SourceEventPolicyResult,
  type SourceEventReadModel,
  type SourceEventRecord,
  type SourceEventRecorder,
  type SourceEventShowInput,
  type SourceEventSourceKind,
  type SourceEventStatus,
  type SourceEventVerificationSummary,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable, sql } from "kysely";

import { type Database, type SourceEventsTable } from "../schema";
import { type RepositoryExecutor, resolveRepositoryExecutor } from "./shared";

type SourceEventRow = Selectable<SourceEventsTable>;

export class PgSourceEventRepository implements SourceEventRecorder, SourceEventReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async findByDedupeKey(
    _context: RepositoryContext,
    dedupeKey: string,
  ): Promise<SourceEventRecord | null> {
    const row = await this.db
      .selectFrom("source_events")
      .selectAll()
      .where("dedupe_key", "=", dedupeKey)
      .executeTakeFirst();

    return row ? recordFromRow(row) : null;
  }

  async record(context: RepositoryContext, record: SourceEventRecord): Promise<SourceEventRecord> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const inserted = await executor
      .insertInto("source_events")
      .values(insertableFromRecord(record))
      .onConflict((conflict) => conflict.column("dedupe_key").doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) {
      return recordFromRow(inserted);
    }

    const existing = await findByDedupeKey(executor, record.dedupeKey);
    return existing ? recordFromRow(existing) : record;
  }

  async list(
    _context: RepositoryContext,
    input: SourceEventListInput,
  ): Promise<SourceEventListPage> {
    const limit = input.limit ?? 50;
    let query = this.db
      .selectFrom("source_events")
      .selectAll()
      .limit(limit + 1);

    if (input.projectId) {
      query = query.where("project_id", "=", input.projectId);
    }

    if (input.resourceId) {
      query = query.where(sql<boolean>`${input.resourceId} = ANY(matched_resource_ids)`);
    }

    if (input.status) {
      query = query.where("status", "=", input.status);
    }

    if (input.sourceKind) {
      query = query.where("source_kind", "=", input.sourceKind);
    }

    if (input.cursor) {
      query = query.where("received_at", "<", input.cursor);
    }

    const rows = await query.orderBy("received_at", "desc").execute();
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? pageRows.at(-1)?.received_at : undefined;

    return {
      items: pageRows.map(listItemFromRow),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async findOne(
    _context: RepositoryContext,
    input: SourceEventShowInput,
  ): Promise<SourceEventDetail | null> {
    let query = this.db
      .selectFrom("source_events")
      .selectAll()
      .where("id", "=", input.sourceEventId);

    if (input.projectId) {
      query = query.where("project_id", "=", input.projectId);
    }

    if (input.resourceId) {
      query = query.where(sql<boolean>`${input.resourceId} = ANY(matched_resource_ids)`);
    }

    const row = await query.executeTakeFirst();
    return row ? detailFromRow(row) : null;
  }
}

async function findByDedupeKey(
  executor: RepositoryExecutor,
  dedupeKey: string,
): Promise<SourceEventRow | undefined> {
  return executor
    .selectFrom("source_events")
    .selectAll()
    .where("dedupe_key", "=", dedupeKey)
    .executeTakeFirst();
}

function insertableFromRecord(record: SourceEventRecord): Insertable<SourceEventsTable> {
  return {
    id: record.sourceEventId,
    project_id: record.projectId ?? null,
    source_kind: record.sourceKind,
    event_kind: record.eventKind,
    source_identity: { ...record.sourceIdentity },
    ref: record.ref,
    revision: record.revision,
    delivery_id: record.deliveryId ?? null,
    idempotency_key: record.idempotencyKey ?? null,
    dedupe_key: record.dedupeKey,
    dedupe_status: record.dedupeStatus,
    dedupe_of_source_event_id: record.dedupeOfSourceEventId ?? null,
    verification: { ...record.verification },
    status: record.status,
    matched_resource_ids: record.matchedResourceIds,
    ignored_reasons: record.ignoredReasons,
    policy_results: record.policyResults.map((result) => ({ ...result })),
    created_deployment_ids: record.createdDeploymentIds,
    received_at: record.receivedAt,
  };
}

function recordFromRow(row: SourceEventRow): SourceEventRecord {
  return {
    sourceEventId: row.id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    matchedResourceIds: [...row.matched_resource_ids],
    sourceKind: row.source_kind as SourceEventSourceKind,
    eventKind: row.event_kind as SourceEventKind,
    sourceIdentity: row.source_identity as unknown as SourceEventRecord["sourceIdentity"],
    ref: row.ref,
    revision: row.revision,
    ...(row.delivery_id ? { deliveryId: row.delivery_id } : {}),
    ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
    dedupeKey: row.dedupe_key,
    dedupeStatus: row.dedupe_status as SourceEventDedupeStatus,
    ...(row.dedupe_of_source_event_id
      ? { dedupeOfSourceEventId: row.dedupe_of_source_event_id }
      : {}),
    verification: row.verification as unknown as SourceEventVerificationSummary,
    status: row.status as SourceEventStatus,
    ignoredReasons: row.ignored_reasons as SourceEventIgnoredReason[],
    policyResults: row.policy_results as unknown as SourceEventPolicyResult[],
    createdDeploymentIds: [...row.created_deployment_ids],
    receivedAt: row.received_at,
  };
}

function listItemFromRow(row: SourceEventRow): SourceEventListItem {
  return {
    sourceEventId: row.id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    resourceIds: [...row.matched_resource_ids],
    sourceKind: row.source_kind as SourceEventSourceKind,
    eventKind: row.event_kind as SourceEventKind,
    ref: row.ref,
    revision: row.revision,
    status: row.status as SourceEventStatus,
    dedupeStatus: row.dedupe_status as SourceEventDedupeStatus,
    ignoredReasons: row.ignored_reasons as SourceEventIgnoredReason[],
    createdDeploymentIds: [...row.created_deployment_ids],
    receivedAt: row.received_at,
  };
}

function detailFromRow(row: SourceEventRow): SourceEventDetail {
  const record = recordFromRow(row);
  return {
    sourceEventId: record.sourceEventId,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    matchedResourceIds: [...record.matchedResourceIds],
    sourceKind: record.sourceKind,
    eventKind: record.eventKind,
    sourceIdentity: { ...record.sourceIdentity },
    ref: record.ref,
    revision: record.revision,
    verification: { ...record.verification },
    status: record.status,
    ...(record.dedupeOfSourceEventId
      ? { dedupeOfSourceEventId: record.dedupeOfSourceEventId }
      : {}),
    policyResults: record.policyResults.map((result) => ({ ...result })),
    createdDeploymentIds: [...record.createdDeploymentIds],
    receivedAt: record.receivedAt,
  };
}
