import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type DurableWorkEventRecord,
  type DurableWorkItemRecord,
  type DurableWorkLedger,
} from "../../durable-work";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type OperatorWorkEventStream,
  type OperatorWorkEventStreamEnvelope,
  type OperatorWorkEventStreamStatusKind,
  type OperatorWorkKind,
  type OperatorWorkObservedEvent,
  type OperatorWorkStatus,
  type StreamOperatorWorkEventsResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type StreamOperatorWorkEventsQuery } from "./stream-operator-work-events.query";

const unsafeDetailKeyPattern =
  /secret|password|passphrase|private[_-]?key|ssh[_-]?key|identity[_-]?file|token|credential|command[_-]?line|commandline|lease|worker/i;
const unsafeDetailValuePattern =
  /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;
const unsafeMessagePattern =
  /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=|command[_ -]?line|commandline|leaseOwner|workerId|attemptCount)/i;
const terminalStatuses = new Set<DurableWorkItemRecord["status"]>([
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
]);

function streamError(
  code: string,
  message: string,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "infra",
    message,
    retryable: true,
    details: {
      queryName: "operator-work.stream-events",
      ...details,
    },
  };
}

function withStreamOperatorWorkDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "operator-work.stream-events",
      ...details,
    },
  };
}

function durableKindToOperatorKind(kind: string): OperatorWorkKind {
  switch (kind) {
    case "deployment":
    case "quick-deploy":
    case "blueprint-install":
    case "runtime-maintenance":
    case "system":
      return kind;
    default:
      return "system";
  }
}

function durableStatusToOperatorStatus(
  status: DurableWorkItemRecord["status"],
): OperatorWorkStatus {
  return status;
}

function sanitizeSafeDetails(
  details?: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (unsafeDetailKeyPattern.test(key)) {
      continue;
    }

    if (typeof value === "string" && unsafeDetailValuePattern.test(value)) {
      continue;
    }

    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeMessage(message?: string): string | undefined {
  if (!message || unsafeMessagePattern.test(message)) {
    return undefined;
  }

  return message;
}

function cursor(workId: string, sequence: number): string {
  return `${workId}:${sequence}`;
}

function snapshotCursor(workId: string, durableSequence: number, updatedAt: string): string {
  return `${workId}:snapshot:${durableSequence}:${encodeURIComponent(updatedAt)}`;
}

function durableSequenceFromCursor(value: string, workId: string): number {
  const snapshotPrefix = `${workId}:snapshot:`;
  if (value.startsWith(snapshotPrefix)) {
    return Number(value.slice(snapshotPrefix.length).split(":", 1)[0] ?? 0);
  }

  const prefix = `${workId}:`;
  return value.startsWith(prefix) ? Number(value.slice(prefix.length)) : 0;
}

interface ParsedCursor {
  afterSequence: number;
  lastSnapshotUpdatedAt?: string;
}

function sequenceFromCursor(value: string | undefined, workId: string): Result<ParsedCursor> {
  if (!value) {
    return ok({ afterSequence: 0 });
  }

  const snapshotPrefix = `${workId}:snapshot:`;
  if (value.startsWith(snapshotPrefix)) {
    const [rawSequence, rawUpdatedAt] = value.slice(snapshotPrefix.length).split(":", 2);
    const sequence = Number(rawSequence);
    if (!Number.isInteger(sequence) || sequence < 0 || !rawUpdatedAt) {
      return err(
        domainError.validation("Operator work stream snapshot cursor is invalid", {
          phase: "event-replay",
          cursor: value,
          workId,
        }),
      );
    }

    return ok({
      afterSequence: sequence,
      lastSnapshotUpdatedAt: decodeURIComponent(rawUpdatedAt),
    });
  }

  const prefix = `${workId}:`;
  if (!value.startsWith(prefix)) {
    return err(
      domainError.validation("Operator work stream cursor does not match work id", {
        phase: "event-replay",
        cursor: value,
        workId,
      }),
    );
  }

  const rawSequence = value.slice(prefix.length);
  const sequence = Number(rawSequence);
  return Number.isInteger(sequence) && sequence >= 0
    ? ok({ afterSequence: sequence })
    : err(
        domainError.validation("Operator work stream cursor sequence is invalid", {
          phase: "event-replay",
          cursor: value,
          workId,
        }),
      );
}

function eventKindFromStatus(
  status: DurableWorkItemRecord["status"],
): OperatorWorkEventStreamStatusKind {
  switch (status) {
    case "pending":
      return "accepted";
    case "running":
      return "running";
    case "retry-scheduled":
      return "retry-scheduled";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "dead-lettered":
      return "dead-lettered";
  }
}

function eventKindFromDurableEvent(
  event: DurableWorkEventRecord,
): OperatorWorkEventStreamStatusKind {
  switch (event.kind) {
    case "accepted":
      return "accepted";
    case "claimed":
      return "running";
    case "progress":
      return "progress";
    case "retry-scheduled":
      return "retry-scheduled";
    case "completed":
      return event.status ? eventKindFromStatus(event.status) : "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "dead-lettered":
      return "dead-lettered";
  }
}

function observedEvent(input: {
  item: DurableWorkItemRecord;
  sequence: number;
  emittedAt: string;
  kind: OperatorWorkEventStreamStatusKind;
  status: DurableWorkItemRecord["status"];
  phase?: string;
  step?: string;
  message?: string;
  cursor: string;
  safeDetails?: Record<string, string | number | boolean | null>;
}): OperatorWorkObservedEvent {
  const { item } = input;
  const safeDetails = sanitizeSafeDetails(input.safeDetails ?? item.safeDetails);
  const message = sanitizeMessage(input.message);

  return {
    workId: item.id,
    sequence: input.sequence,
    cursor: input.cursor,
    emittedAt: input.emittedAt,
    kind: input.kind,
    status: durableStatusToOperatorStatus(input.status),
    operationKey: item.operationKey,
    workKind: durableKindToOperatorKind(item.kind),
    ...(input.phase ? { phase: input.phase } : {}),
    ...(input.step ? { step: input.step } : {}),
    ...(message ? { message } : {}),
    ...(item.projectId ? { projectId: item.projectId } : {}),
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    ...(item.deploymentId ? { deploymentId: item.deploymentId } : {}),
    ...(item.serverId ? { serverId: item.serverId } : {}),
    ...(item.errorCode ? { errorCode: item.errorCode } : {}),
    ...(item.errorCategory ? { errorCategory: item.errorCategory } : {}),
    ...(item.retriable === undefined ? {} : { retriable: item.retriable }),
    ...(safeDetails ? { safeDetails } : {}),
  };
}

function envelopeFromEvent(
  item: DurableWorkItemRecord,
  event: DurableWorkEventRecord,
): OperatorWorkEventStreamEnvelope {
  const kind = eventKindFromDurableEvent(event);
  return {
    schemaVersion: "operator-work.stream-events/v1",
    kind,
    event: observedEvent({
      item,
      sequence: event.sequence,
      cursor: cursor(item.id, event.sequence),
      emittedAt: event.occurredAt,
      kind,
      status: event.status ?? item.status,
      ...((event.phase ?? item.phase) ? { phase: event.phase ?? item.phase } : {}),
      ...((event.step ?? item.step) ? { step: event.step ?? item.step } : {}),
      ...(event.message ? { message: event.message } : {}),
      ...((event.safeDetails ?? item.safeDetails)
        ? { safeDetails: event.safeDetails ?? item.safeDetails }
        : {}),
    }),
  };
}

function envelopeFromSnapshot(
  item: DurableWorkItemRecord,
  sequence: number,
  durableSequence: number,
): OperatorWorkEventStreamEnvelope {
  const kind = eventKindFromStatus(item.status);
  return {
    schemaVersion: "operator-work.stream-events/v1",
    kind,
    event: observedEvent({
      item,
      sequence,
      cursor: snapshotCursor(item.id, durableSequence, item.updatedAt),
      emittedAt: item.updatedAt,
      kind,
      status: item.status,
      ...(item.phase ? { phase: item.phase } : {}),
      ...(item.step ? { step: item.step } : {}),
      ...(item.safeDetails ? { safeDetails: item.safeDetails } : {}),
    }),
  };
}

function isStatusEnvelope(
  envelope: OperatorWorkEventStreamEnvelope,
): envelope is Extract<
  OperatorWorkEventStreamEnvelope,
  { kind: OperatorWorkEventStreamStatusKind }
> {
  return "event" in envelope;
}

async function loadWorkEvents(input: {
  ledger: DurableWorkLedger;
  context: ReturnType<typeof toRepositoryContext>;
  workId: string;
  afterSequence: number;
  historyLimit: number;
  includeHistory: boolean;
  includeSnapshot: boolean;
  lastSnapshotUpdatedAt?: string;
}): Promise<
  Result<{
    item: DurableWorkItemRecord;
    envelopes: OperatorWorkEventStreamEnvelope[];
    snapshotEmittedAt?: string;
  }>
> {
  const itemResult = await input.ledger.findItem(input.context, input.workId);
  if (itemResult.isErr()) {
    return err(itemResult.error);
  }

  if (!itemResult.value) {
    return err(domainError.notFound("operator work item", input.workId));
  }
  const item = itemResult.value;

  const eventResult = await input.ledger.listEvents(input.context, input.workId);
  if (eventResult.isErr()) {
    return err(eventResult.error);
  }

  const historicalEvents = input.includeHistory
    ? eventResult.value
        .filter((event) => event.sequence > input.afterSequence)
        .slice(-input.historyLimit)
    : [];
  const envelopes = historicalEvents.map((event) => envelopeFromEvent(item, event));
  const latestSequence =
    eventResult.value.reduce((max, event) => Math.max(max, event.sequence), 0) ||
    input.afterSequence;
  const latestEmittedSequence = envelopes.reduce((max, envelope) => {
    return isStatusEnvelope(envelope) ? Math.max(max, envelope.event.sequence) : max;
  }, input.afterSequence);

  const latestEnvelope = envelopes.at(-1);
  const latestEnvelopeAt =
    latestEnvelope && isStatusEnvelope(latestEnvelope) ? latestEnvelope.event.emittedAt : undefined;
  const shouldEmitSnapshot =
    input.includeSnapshot &&
    (!input.lastSnapshotUpdatedAt || item.updatedAt > input.lastSnapshotUpdatedAt) &&
    (!latestEnvelopeAt || item.updatedAt > latestEnvelopeAt);
  let snapshotEmittedAt: string | undefined;

  if (shouldEmitSnapshot) {
    envelopes.push(
      envelopeFromSnapshot(
        item,
        Math.max(latestSequence, latestEmittedSequence, input.afterSequence) + 1,
        latestSequence,
      ),
    );
    snapshotEmittedAt = item.updatedAt;
  }

  return ok({
    item,
    envelopes,
    ...(snapshotEmittedAt ? { snapshotEmittedAt } : {}),
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

class DurableOperatorWorkEventStream implements OperatorWorkEventStream {
  private closed = false;

  constructor(
    private readonly input: {
      ledger: DurableWorkLedger;
      context: ReturnType<typeof toRepositoryContext>;
      workId: string;
      afterSequence: number;
      initialItem: DurableWorkItemRecord;
      initialEnvelopes: OperatorWorkEventStreamEnvelope[];
      initialSnapshotEmittedAt?: string;
      pollIntervalMs: number;
      untilTerminal: boolean;
      signal: AbortSignal;
      clock: Clock;
    },
  ) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<OperatorWorkEventStreamEnvelope> {
    let afterSequence = this.input.afterSequence;
    let lastCursor: string | undefined =
      afterSequence > 0 ? cursor(this.input.workId, afterSequence) : undefined;
    let lastSnapshotUpdatedAt: string | undefined = this.input.initialSnapshotEmittedAt;

    for (const envelope of this.input.initialEnvelopes) {
      if (!isStatusEnvelope(envelope)) {
        yield envelope;
        continue;
      }

      afterSequence = durableSequenceFromCursor(envelope.event.cursor, this.input.workId);
      lastCursor = envelope.event.cursor;
      yield envelope;
    }

    if (this.input.untilTerminal && terminalStatuses.has(this.input.initialItem.status)) {
      yield {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "closed",
        reason: "completed",
        ...(lastCursor ? { cursor: lastCursor } : {}),
      };
      return;
    }

    while (!this.closed && !this.input.signal.aborted) {
      const result = await loadWorkEvents({
        ledger: this.input.ledger,
        context: this.input.context,
        workId: this.input.workId,
        afterSequence,
        historyLimit: 200,
        includeHistory: true,
        includeSnapshot: true,
        ...(lastSnapshotUpdatedAt ? { lastSnapshotUpdatedAt } : {}),
      });

      if (result.isErr()) {
        yield {
          schemaVersion: "operator-work.stream-events/v1",
          kind: "error",
          error: withStreamOperatorWorkDetails(result.error, {
            phase: "live-follow",
            workId: this.input.workId,
          }),
        };
        return;
      }

      let emitted = false;
      for (const envelope of result.value.envelopes) {
        if (!isStatusEnvelope(envelope) || envelope.event.sequence <= afterSequence) {
          continue;
        }

        afterSequence = durableSequenceFromCursor(envelope.event.cursor, this.input.workId);
        lastCursor = envelope.event.cursor;
        emitted = true;
        yield envelope;
      }
      if (result.value.snapshotEmittedAt) {
        lastSnapshotUpdatedAt = result.value.snapshotEmittedAt;
      }

      if (this.input.untilTerminal && terminalStatuses.has(result.value.item.status)) {
        yield {
          schemaVersion: "operator-work.stream-events/v1",
          kind: "closed",
          reason: "completed",
          ...(lastCursor ? { cursor: lastCursor } : {}),
        };
        return;
      }

      if (!emitted) {
        yield {
          schemaVersion: "operator-work.stream-events/v1",
          kind: "heartbeat",
          at: this.input.clock.now(),
          ...(lastCursor ? { cursor: lastCursor } : {}),
        };
      }

      await sleep(this.input.pollIntervalMs, this.input.signal);
    }

    yield {
      schemaVersion: "operator-work.stream-events/v1",
      kind: "closed",
      reason: "cancelled",
      ...(lastCursor ? { cursor: lastCursor } : {}),
    };
  }
}

@injectable()
export class StreamOperatorWorkEventsQueryService {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.durableWorkQueueAdapter, { isOptional: true })
    private readonly durableWorkLedger?: DurableWorkLedger,
  ) {}

  async execute(
    context: ExecutionContext,
    query: StreamOperatorWorkEventsQuery,
  ): Promise<Result<StreamOperatorWorkEventsResult>> {
    if (!this.durableWorkLedger) {
      return err(
        streamError(
          "operator_work_event_stream_unavailable",
          "Operator work stream is unavailable",
          {
            phase: "event-source-load",
            workId: query.workId,
          },
        ),
      );
    }

    const parsedCursor = sequenceFromCursor(query.cursor, query.workId);
    if (parsedCursor.isErr()) {
      return err(
        withStreamOperatorWorkDetails(parsedCursor.error, {
          workId: query.workId,
          phase: "event-replay",
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    const signal = query.signal ?? new AbortController().signal;
    const replay = await loadWorkEvents({
      ledger: this.durableWorkLedger,
      context: repositoryContext,
      workId: query.workId,
      afterSequence: parsedCursor.value.afterSequence,
      historyLimit: query.historyLimit,
      includeHistory: query.includeHistory,
      includeSnapshot: true,
      ...(parsedCursor.value.lastSnapshotUpdatedAt
        ? { lastSnapshotUpdatedAt: parsedCursor.value.lastSnapshotUpdatedAt }
        : {}),
    });

    if (replay.isErr()) {
      return err(
        withStreamOperatorWorkDetails(replay.error, {
          workId: query.workId,
          phase: "event-replay",
        }),
      );
    }

    if (!query.follow) {
      return ok({
        mode: "bounded",
        workId: query.workId,
        envelopes: replay.value.envelopes,
      });
    }

    return ok({
      mode: "stream",
      workId: query.workId,
      stream: new DurableOperatorWorkEventStream({
        ledger: this.durableWorkLedger,
        context: repositoryContext,
        workId: query.workId,
        afterSequence: parsedCursor.value.afterSequence,
        initialItem: replay.value.item,
        initialEnvelopes: replay.value.envelopes,
        ...(replay.value.snapshotEmittedAt
          ? { initialSnapshotEmittedAt: replay.value.snapshotEmittedAt }
          : {}),
        pollIntervalMs: query.pollIntervalMs,
        untilTerminal: query.untilTerminal,
        signal,
        clock: this.clock,
      }),
    });
  }
}
