import { createHash } from "node:crypto";
import {
  type DeploymentEventStream,
  type DeploymentEventStreamEnvelope,
  type DeploymentObservedEventSource,
  type DeploymentObservedEventType,
  type DomainEventStreamObservationReader,
  type DomainEventStreamObservationReplayResult,
  type DomainEventStreamObservationRequest,
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

type DeploymentEventStreamRecordRow = Pick<
  Selectable<Database["domain_event_stream_records"]>,
  "id" | "cursor" | "occurred_at" | "event_type" | "source_kind" | "summary" | "payload"
>;

type DomainEventStreamPruneQuery = SelectQueryBuilder<
  Database,
  "domain_event_stream_records",
  DomainEventStreamRecordRow
>;

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
): DeploymentObservedEventType | undefined {
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
  observedEventType: DeploymentObservedEventType,
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
  observedEventType: DeploymentObservedEventType,
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

function timestampToIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function deploymentEventStreamGapEnvelope(
  cursor: string,
  lastSequence?: number,
): DeploymentEventStreamEnvelope {
  return {
    schemaVersion: "deployments.stream-events/v1",
    kind: "gap",
    gap: {
      code: "deployment_event_stream_gap",
      phase: "event-replay",
      retriable: true,
      cursor,
      ...(lastSequence ? { lastSequence } : {}),
      recommendedAction: "restart-stream",
    },
  };
}

function deploymentEventCursorInvalidError(deploymentId: string, cursor: string) {
  return {
    ...domainError.validation("Deployment event cursor is invalid", {
      queryName: "deployments.stream-events",
      phase: "cursor-resolution",
      deploymentId,
      cursor,
    }),
    code: "deployment_event_cursor_invalid",
  };
}

function deploymentEventStreamUnavailableError(reason: unknown) {
  return {
    ...domainError.infra("Deployment event stream is unavailable", {
      queryName: "deployments.stream-events",
      phase: "event-source-load",
      adapter: "persistence.pg",
      reason: reason instanceof Error ? reason.message : "unknown",
    }),
    code: "deployment_event_stream_unavailable",
  };
}

function normalizedObservedEventSource(sourceKind: string): DeploymentObservedEventSource {
  if (
    sourceKind === "domain-event" ||
    sourceKind === "process-observation" ||
    sourceKind === "progress-projection"
  ) {
    return sourceKind;
  }

  return "domain-event";
}

function normalizedObservedEventType(eventType: string): DeploymentObservedEventType {
  if (
    eventType === "deployment-requested" ||
    eventType === "build-requested" ||
    eventType === "deployment-started" ||
    eventType === "deployment-succeeded" ||
    eventType === "deployment-failed" ||
    eventType === "deployment-progress"
  ) {
    return eventType;
  }

  return "deployment-progress";
}

function positivePayloadSequence(payload: Record<string, unknown>): number | undefined {
  const value = payload.sequence;

  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function statusFromPayload(payload: Record<string, unknown>): string | undefined {
  return typeof payload.status === "string" && payload.status.trim() ? payload.status : undefined;
}

function phaseFromPayload(
  payload: Record<string, unknown>,
): "detect" | "plan" | "package" | "deploy" | "verify" | "rollback" | undefined {
  const value = payload.phase;

  if (
    value === "detect" ||
    value === "plan" ||
    value === "package" ||
    value === "deploy" ||
    value === "verify" ||
    value === "rollback"
  ) {
    return value;
  }

  return undefined;
}

function retainedRowToEnvelope(
  deploymentId: string,
  row: DeploymentEventStreamRecordRow,
  index: number,
): DeploymentEventStreamEnvelope {
  const sequence = positivePayloadSequence(row.payload) ?? index + 1;
  const status = statusFromPayload(row.payload);
  const phase = phaseFromPayload(row.payload);

  return {
    schemaVersion: "deployments.stream-events/v1",
    kind: "event",
    event: {
      deploymentId,
      sequence,
      cursor: row.cursor,
      emittedAt: timestampToIso(row.occurred_at),
      source: normalizedObservedEventSource(row.source_kind),
      eventType: normalizedObservedEventType(row.event_type),
      ...(phase ? { phase } : {}),
      ...(status ? { status } : {}),
      ...(status === "failed" ? { retriable: true } : {}),
      ...(row.summary ? { summary: row.summary } : {}),
    },
  };
}

function closedEnvelope(
  reason: "completed" | "cancelled" | "source-ended",
  cursor: string | undefined,
): DeploymentEventStreamEnvelope {
  return {
    schemaVersion: "deployments.stream-events/v1",
    kind: "closed",
    reason,
    ...(cursor ? { cursor } : {}),
  };
}

function isTerminalEventEnvelope(envelope: DeploymentEventStreamEnvelope): boolean {
  if (envelope.kind !== "event") {
    return false;
  }

  return (
    envelope.event.eventType === "deployment-succeeded" ||
    envelope.event.eventType === "deployment-failed" ||
    envelope.event.status === "succeeded" ||
    envelope.event.status === "failed" ||
    envelope.event.status === "canceled" ||
    envelope.event.status === "rolled-back"
  );
}

function retainedDeploymentEventStream(input: {
  iterate: () => AsyncGenerator<DeploymentEventStreamEnvelope, void, void>;
  close: () => void;
}): DeploymentEventStream {
  let closed = false;

  return {
    async close(): Promise<void> {
      if (closed) {
        return;
      }

      closed = true;
      input.close();
    },
    async *[Symbol.asyncIterator](): AsyncIterator<DeploymentEventStreamEnvelope> {
      try {
        yield* input.iterate();
      } finally {
        if (!closed) {
          closed = true;
          input.close();
        }
      }
    },
  };
}

export class PgDomainEventStreamRetentionStore
  implements
    DomainEventStreamRetentionStore,
    DomainEventStreamObservationReader,
    DomainEventStreamRecorder
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

  async replayDeploymentEvents(
    context: RepositoryContext,
    request: DomainEventStreamObservationRequest,
  ): Promise<Result<DomainEventStreamObservationReplayResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const rows = await executor
        .selectFrom("domain_event_stream_records")
        .select(["id", "cursor", "occurred_at", "event_type", "source_kind", "summary", "payload"])
        .where("stream_scope", "=", "deployment")
        .where("stream_id", "=", request.deploymentId)
        .orderBy("occurred_at", "asc")
        .orderBy("id", "asc")
        .execute();
      const watermark = await executor
        .selectFrom("domain_event_stream_prune_watermarks")
        .select(["last_pruned_cursor"])
        .where("stream_scope", "=", "deployment")
        .where("stream_id", "=", request.deploymentId)
        .executeTakeFirst();

      if (rows.length === 0 && !watermark) {
        return ok({ available: false });
      }

      if (request.cursor) {
        const cursorIndex = rows.findIndex((row) => row.cursor === request.cursor);

        if (cursorIndex === -1) {
          if (watermark?.last_pruned_cursor === request.cursor) {
            return ok({
              available: true,
              envelopes: [deploymentEventStreamGapEnvelope(request.cursor)],
            });
          }

          return err(deploymentEventCursorInvalidError(request.deploymentId, request.cursor));
        }

        const replayRows = request.includeHistory
          ? rows.slice(cursorIndex + 1, cursorIndex + 1 + request.historyLimit)
          : [];
        const envelopes = replayRows.map((row, index) =>
          retainedRowToEnvelope(request.deploymentId, row, cursorIndex + 1 + index),
        );
        const lastCursor = replayRows.at(-1)?.cursor ?? request.cursor;

        return ok({
          available: true,
          envelopes: [
            ...envelopes,
            closedEnvelope(request.untilTerminal ? "completed" : "source-ended", lastCursor),
          ],
        });
      }

      const replayRows = request.includeHistory
        ? rows.slice(Math.max(rows.length - request.historyLimit, 0))
        : [];
      const firstIndex = rows.length - replayRows.length;
      const envelopes = replayRows.map((row, index) =>
        retainedRowToEnvelope(request.deploymentId, row, firstIndex + index),
      );
      const lastCursor = replayRows.at(-1)?.cursor;

      return ok({
        available: true,
        envelopes: [
          ...envelopes,
          closedEnvelope(request.untilTerminal ? "completed" : "source-ended", lastCursor),
        ],
      });
    } catch (error) {
      return err(deploymentEventStreamUnavailableError(error));
    }
  }

  async openDeploymentEventStream(
    context: RepositoryContext,
    request: DomainEventStreamObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DomainEventStreamObservationReplayResult | DeploymentEventStream>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const initialRows = await executor
        .selectFrom("domain_event_stream_records")
        .select(["id", "cursor", "occurred_at", "event_type", "source_kind", "summary", "payload"])
        .where("stream_scope", "=", "deployment")
        .where("stream_id", "=", request.deploymentId)
        .orderBy("occurred_at", "asc")
        .orderBy("id", "asc")
        .execute();
      const watermark = await executor
        .selectFrom("domain_event_stream_prune_watermarks")
        .select(["last_pruned_cursor"])
        .where("stream_scope", "=", "deployment")
        .where("stream_id", "=", request.deploymentId)
        .executeTakeFirst();

      if (initialRows.length === 0 && !watermark) {
        return ok({ available: false });
      }

      if (request.cursor) {
        const cursorIndex = initialRows.findIndex((row) => row.cursor === request.cursor);
        if (cursorIndex === -1) {
          if (watermark?.last_pruned_cursor === request.cursor) {
            const gapStream = retainedDeploymentEventStream({
              close: () => undefined,
              iterate: async function* (): AsyncGenerator<
                DeploymentEventStreamEnvelope,
                void,
                void
              > {
                yield deploymentEventStreamGapEnvelope(request.cursor ?? "");
              },
            });

            return ok(gapStream);
          }

          return err(deploymentEventCursorInvalidError(request.deploymentId, request.cursor));
        }
      }

      const cursorIndex = request.cursor
        ? initialRows.findIndex((row) => row.cursor === request.cursor)
        : -1;
      const replayRows = request.includeHistory
        ? request.cursor
          ? initialRows.slice(cursorIndex + 1, cursorIndex + 1 + request.historyLimit)
          : initialRows.slice(Math.max(initialRows.length - request.historyLimit, 0))
        : [];
      const firstReplayIndex = request.cursor
        ? cursorIndex + 1
        : initialRows.length - replayRows.length;
      let lastCursor = replayRows.at(-1)?.cursor;
      let nextSequence = firstReplayIndex + replayRows.length + 1;

      if (!lastCursor) {
        lastCursor =
          request.cursor ?? (!request.includeHistory ? initialRows.at(-1)?.cursor : undefined);
        nextSequence = initialRows.length + 1;
      }

      let closed = false;
      const stream = retainedDeploymentEventStream({
        close: () => {
          closed = true;
        },
        iterate: async function* (): AsyncGenerator<DeploymentEventStreamEnvelope, void, void> {
          for (const [index, row] of replayRows.entries()) {
            if (closed) {
              return;
            }

            const envelope = retainedRowToEnvelope(
              request.deploymentId,
              row,
              firstReplayIndex + index,
            );
            if (envelope.kind === "event") {
              lastCursor = envelope.event.cursor;
              nextSequence = envelope.event.sequence + 1;
            }

            yield envelope;

            if (request.untilTerminal && isTerminalEventEnvelope(envelope)) {
              yield closedEnvelope("completed", lastCursor);
              return;
            }
          }

          while (!closed) {
            if (signal.aborted) {
              yield closedEnvelope("cancelled", lastCursor ?? request.cursor);
              return;
            }

            try {
              const rows = await executor
                .selectFrom("domain_event_stream_records")
                .select([
                  "id",
                  "cursor",
                  "occurred_at",
                  "event_type",
                  "source_kind",
                  "summary",
                  "payload",
                ])
                .where("stream_scope", "=", "deployment")
                .where("stream_id", "=", request.deploymentId)
                .orderBy("occurred_at", "asc")
                .orderBy("id", "asc")
                .execute();
              const liveCursorIndex = lastCursor
                ? rows.findIndex((row) => row.cursor === lastCursor)
                : -1;
              if (lastCursor && liveCursorIndex === -1) {
                yield deploymentEventStreamGapEnvelope(lastCursor);
                return;
              }

              const candidateRows = lastCursor ? rows.slice(liveCursorIndex + 1) : rows;

              if (candidateRows.length > 0) {
                for (const row of candidateRows) {
                  if (closed) {
                    return;
                  }

                  const envelope = retainedRowToEnvelope(
                    request.deploymentId,
                    row,
                    nextSequence - 1,
                  );
                  if (envelope.kind === "event") {
                    nextSequence = envelope.event.sequence + 1;
                    lastCursor = envelope.event.cursor;
                  }

                  yield envelope;

                  if (request.untilTerminal && isTerminalEventEnvelope(envelope)) {
                    yield closedEnvelope("completed", lastCursor);
                    return;
                  }
                }

                continue;
              }
            } catch (error) {
              yield {
                schemaVersion: "deployments.stream-events/v1",
                kind: "error",
                error: {
                  ...deploymentEventStreamUnavailableError(error),
                  code: "deployment_event_follow_failed",
                  details: {
                    queryName: "deployments.stream-events",
                    phase: "live-follow",
                    deploymentId: request.deploymentId,
                    reason: error instanceof Error ? error.message : "unknown",
                  },
                },
              };
              return;
            }

            await new Promise<void>((resolve) => setTimeout(resolve, 250));
          }

          yield closedEnvelope("source-ended", lastCursor ?? request.cursor);
        },
      });

      return ok(stream);
    } catch (error) {
      return err(deploymentEventStreamUnavailableError(error));
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
