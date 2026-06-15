import { createHash } from "node:crypto";
import {
  type DomainEventStreamPruneInput,
  type DomainEventStreamPruneStoreResult,
  type DomainEventStreamRecorder,
  type DomainEventStreamRecordInput,
  type DomainEventStreamRetentionStore,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type DomainEventStreamRecordRow = Pick<
  Selectable<Database["domain_event_stream_records"]>,
  "id" | "stream_scope" | "stream_id" | "cursor" | "event_type" | "guard_reason"
>;

type DomainEventStreamPruneQuery = SelectQueryBuilder<
  Database,
  "domain_event_stream_records",
  DomainEventStreamRecordRow
>;

type RetainedDeploymentDomainEventType =
  | "deployment-started"
  | "deployment-succeeded"
  | "deployment-failed"
  | "deployment-progress";

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function deploymentIdFromDomainEvent(event: DomainEventStreamRecordInput["event"]): string {
  return event.aggregateId;
}

function observedEventTypeFromDomainEvent(
  event: DomainEventStreamRecordInput["event"],
): RetainedDeploymentDomainEventType | undefined {
  if (event.type === "deployment.started") {
    return "deployment-started";
  }

  if (event.type === "deployment.finished") {
    return statusFromDomainEvent(event, "deployment-progress") === "failed"
      ? "deployment-failed"
      : "deployment-succeeded";
  }

  return undefined;
}

function statusFromDomainEvent(
  event: DomainEventStreamRecordInput["event"],
  observedEventType: RetainedDeploymentDomainEventType,
): string {
  const payload = payloadRecord(event.payload);
  const status = payload.status;

  if (typeof status === "string" && status.trim()) {
    return status;
  }

  if (observedEventType === "deployment-started") {
    return "running";
  }

  if (observedEventType === "deployment-succeeded") {
    return "succeeded";
  }

  if (observedEventType === "deployment-failed") {
    return "failed";
  }

  return "running";
}

function summaryFromDomainEvent(
  event: DomainEventStreamRecordInput["event"],
  observedEventType: RetainedDeploymentDomainEventType,
): string {
  const payload = payloadRecord(event.payload);
  const errorMessage = payload.errorMessage;

  if (typeof errorMessage === "string" && errorMessage.trim()) {
    return errorMessage;
  }

  switch (observedEventType) {
    case "deployment-started":
      return "Deployment started";
    case "deployment-succeeded":
      return "Deployment succeeded";
    case "deployment-failed":
      return "Deployment failed";
    default:
      return event.type;
  }
}

function stableEventCursor(event: DomainEventStreamRecordInput["event"]): string {
  return createHash("sha256")
    .update(JSON.stringify([event.aggregateId, event.type, event.occurredAt, event.payload]))
    .digest("hex")
    .slice(0, 32);
}

function applyPruneScope(
  query: DomainEventStreamPruneQuery,
  input: DomainEventStreamPruneInput,
): DomainEventStreamPruneQuery {
  let scoped = query.where("occurred_at", "<", input.before);

  if (input.eventType) {
    scoped = scoped.where("event_type", "=", input.eventType);
  }

  if (input.aggregateId) {
    scoped = scoped.where("aggregate_id", "=", input.aggregateId);
  }

  if (input.aggregateType) {
    scoped = scoped.where("aggregate_type", "=", input.aggregateType);
  }

  if (input.deploymentId) {
    scoped = scoped.where("deployment_id", "=", input.deploymentId);
  }

  if (input.limit) {
    scoped = scoped.limit(input.limit);
  }

  return scoped.orderBy("occurred_at", "asc").orderBy("id", "asc");
}

function summarizeRows(
  input: DomainEventStreamPruneInput,
  rows: DomainEventStreamRecordRow[],
): DomainEventStreamPruneStoreResult {
  const candidateRows = rows.filter((row) => !row.guard_reason);
  const skippedRows = rows.filter((row) => row.guard_reason);
  const countsByEventType: Record<string, number> = {};
  const skippedCountsByReason: Record<string, number> = {};

  for (const row of candidateRows) {
    countsByEventType[row.event_type] = (countsByEventType[row.event_type] ?? 0) + 1;
  }

  for (const row of skippedRows) {
    const reason = row.guard_reason ?? "unknown";
    skippedCountsByReason[reason] = (skippedCountsByReason[reason] ?? 0) + 1;
  }

  return {
    inspectedCount: rows.length,
    candidateCount: candidateRows.length,
    prunedCount: input.dryRun ? 0 : candidateRows.length,
    skippedCount: skippedRows.length,
    countsByEventType,
    skippedCountsByReason,
  };
}

export class PgDomainEventStreamRetentionStore
  implements DomainEventStreamRetentionStore, DomainEventStreamRecorder
{
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    input: DomainEventStreamRecordInput,
  ): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const observedEventType = observedEventTypeFromDomainEvent(input.event);

    if (!observedEventType) {
      return ok(undefined);
    }

    const deploymentId = deploymentIdFromDomainEvent(input.event);
    if (!deploymentId) {
      return ok(undefined);
    }

    const payload = payloadRecord(input.event.payload);
    const cursor = stableEventCursor(input.event);

    try {
      await executor
        .insertInto("domain_event_stream_records")
        .values({
          id: `des_${cursor}`,
          stream_scope: "deployment",
          stream_id: deploymentId,
          cursor,
          occurred_at: input.event.occurredAt,
          event_type: observedEventType,
          source_kind: "domain-event",
          aggregate_id: input.event.aggregateId,
          aggregate_type: "deployment",
          deployment_id: deploymentId,
          correlation_id: null,
          causation_id: null,
          request_id: input.requestId,
          summary: summaryFromDomainEvent(input.event, observedEventType),
          payload: {
            ...payload,
            status: statusFromDomainEvent(input.event, observedEventType),
          },
          guard_reason: null,
          created_at: input.event.occurredAt,
        })
        .onConflict((oc) => oc.column("cursor").doNothing())
        .execute();

      return ok(undefined);
    } catch (error) {
      return err(
        domainError.infra("Domain event stream record could not be written", {
          phase: "domain-event-stream-record",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async prune(
    context: RepositoryContext,
    input: DomainEventStreamPruneInput,
  ): Promise<Result<DomainEventStreamPruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const rows = await applyPruneScope(
        executor
          .selectFrom("domain_event_stream_records")
          .select(["id", "stream_scope", "stream_id", "cursor", "event_type", "guard_reason"]),
        input,
      ).execute();
      const summary = summarizeRows(input, rows);

      if (input.dryRun || summary.candidateCount === 0) {
        return ok(summary);
      }

      const candidateRows = rows.filter((row) => !row.guard_reason);
      const candidateIds = candidateRows.map((row) => row.id);
      const deletedRows = await executor
        .deleteFrom("domain_event_stream_records")
        .where("id", "in", candidateIds)
        .returning(["id", "stream_scope", "stream_id", "cursor"])
        .execute();
      const lastDeletedByStream = new Map<
        string,
        Pick<DomainEventStreamRecordRow, "stream_scope" | "stream_id" | "cursor">
      >();

      for (const row of candidateRows) {
        if (!deletedRows.some((deleted) => deleted.id === row.id)) {
          continue;
        }

        lastDeletedByStream.set(`${row.stream_scope}:${row.stream_id}`, row);
      }

      for (const row of lastDeletedByStream.values()) {
        await executor
          .insertInto("domain_event_stream_prune_watermarks")
          .values({
            stream_scope: row.stream_scope,
            stream_id: row.stream_id,
            pruned_before: input.before,
            last_pruned_cursor: row.cursor,
            updated_at: input.before,
          })
          .onConflict((oc) =>
            oc.columns(["stream_scope", "stream_id"]).doUpdateSet({
              pruned_before: input.before,
              last_pruned_cursor: row.cursor,
              updated_at: input.before,
            }),
          )
          .execute();
      }

      return ok({
        ...summary,
        prunedCount: deletedRows.length,
      });
    } catch (error) {
      return err(
        domainError.infra("Domain event stream retention prune could not be completed", {
          phase: "domain-event-stream-retention",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
