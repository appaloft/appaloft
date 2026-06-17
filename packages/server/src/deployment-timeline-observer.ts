import {
  type DeploymentProgressEvent,
  type DeploymentProgressObserver,
  type DeploymentReadModel,
  type DeploymentTimelineEntry,
  type DeploymentTimelineEnvelope,
  type DeploymentTimelineKind,
  type DeploymentTimelineObservationContext,
  type DeploymentTimelineObservationRequest,
  type DeploymentTimelineObserver,
  type DeploymentTimelineSource,
  type DeploymentTimelineStream,
  type ExecutionContext,
  tokens,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentByIdSpec,
  DeploymentId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

const schemaVersion = "deployments.timeline/v1";
const persistentRefreshIntervalMs = 2_000;

type BufferedProgressEvent = {
  context: ExecutionContext;
  event: DeploymentProgressEvent;
};

type DeploymentTimelineStreamState = {
  abortReason?: "cancelled";
  closed: boolean;
  events: BufferedProgressEvent[];
  lastDeliveredAt?: string;
  lastCursor?: string;
  nextSequence: number;
  wake: (() => void) | undefined;
};

function timelineCursor(deploymentId: string, sequence: number): string {
  return `${deploymentId}:${sequence}`;
}

function invalidCursorError(deploymentId: string, cursor: string): DomainError {
  return {
    ...domainError.validation("Deployment timeline cursor is invalid", {
      queryName: "deployments.timeline",
      phase: "cursor-resolution",
      deploymentId,
      cursor,
    }),
    code: "deployment_timeline_cursor_invalid",
  };
}

function timelineUnavailableError(deploymentId: string, reason: unknown): DomainError {
  return {
    code: "deployment_timeline_unavailable",
    category: "infra",
    message: "Deployment timeline is unavailable",
    retryable: true,
    details: {
      queryName: "deployments.timeline",
      phase: "timeline-source-load",
      deploymentId,
      reason: reason instanceof Error ? reason.message : String(reason),
    },
  };
}

function parseCursor(deploymentId: string, cursor: string | undefined): Result<number | undefined> {
  if (!cursor) {
    return ok(undefined);
  }

  const separatorIndex = cursor.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= cursor.length - 1) {
    return err(invalidCursorError(deploymentId, cursor));
  }

  const cursorDeploymentId = cursor.slice(0, separatorIndex);
  const rawSequence = cursor.slice(separatorIndex + 1);
  const sequence = Number(rawSequence);
  if (
    cursorDeploymentId !== deploymentId ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    rawSequence !== String(sequence)
  ) {
    return err(invalidCursorError(deploymentId, cursor));
  }

  return ok(sequence);
}

function timelineKindFromProgress(event: DeploymentProgressEvent): DeploymentTimelineKind {
  if (event.stream) {
    return "output";
  }

  if (event.status) {
    return "status";
  }

  if (event.step) {
    return "step";
  }

  return "lifecycle";
}

function timelineSourceFromProgress(event: DeploymentProgressEvent): DeploymentTimelineSource {
  return event.source;
}

function timelineKindFromJournalSource(source: DeploymentTimelineSource): DeploymentTimelineKind {
  if (
    source === "application" ||
    source === "docker" ||
    source === "ssh" ||
    source === "provider"
  ) {
    return "output";
  }

  if (source === "health") {
    return "health-check";
  }

  if (source === "domain-event") {
    return "status";
  }

  return "lifecycle";
}

function isTerminalDeploymentStatus(status: string | undefined): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled" ||
    status === "rolled-back"
  );
}

function isTerminalProgressEvent(event: DeploymentProgressEvent): boolean {
  if (event.status === "failed") {
    return true;
  }

  if (event.phase !== "verify") {
    return false;
  }

  return /\b(?:public route|deployment)\b.*\breachable\b/i.test(event.message);
}

function createDeploymentTimelineStream(input: {
  iterate: () => AsyncGenerator<DeploymentTimelineEnvelope, void, void>;
  close: () => void;
}): DeploymentTimelineStream {
  let closed = false;

  return {
    async close(): Promise<void> {
      if (closed) {
        return;
      }

      closed = true;
      input.close();
    },
    async *[Symbol.asyncIterator](): AsyncIterator<DeploymentTimelineEnvelope> {
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

function closedEnvelope(
  reason: "completed" | "cancelled" | "source-ended",
  cursor: string | undefined,
): DeploymentTimelineEnvelope {
  return {
    schemaVersion,
    kind: "closed",
    reason,
    ...(cursor ? { cursor } : {}),
  };
}

function entryEnvelope(entry: DeploymentTimelineEntry): DeploymentTimelineEnvelope {
  return {
    schemaVersion,
    kind: "entry",
    entry,
  };
}

function entryMatchesRequest(
  entry: DeploymentTimelineEntry,
  request: DeploymentTimelineObservationRequest,
): boolean {
  return (
    (!request.kinds || request.kinds.includes(entry.kind)) &&
    (!request.sources || request.sources.includes(entry.source))
  );
}

@injectable()
export class ShellDeploymentTimelineObserver implements DeploymentTimelineObserver {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.deploymentProgressReporter)
    private readonly deploymentProgressObserver: DeploymentProgressObserver,
  ) {}

  async open(
    context: ExecutionContext,
    observationContext: DeploymentTimelineObservationContext,
    request: DeploymentTimelineObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DeploymentTimelineStream>> {
    const deploymentId = observationContext.deployment.id;
    const parsedCursor = parseCursor(deploymentId, request.cursor);
    if (parsedCursor.isErr()) {
      return err(parsedCursor.error);
    }

    const repositoryContext = toRepositoryContext(context);
    const state: DeploymentTimelineStreamState = {
      closed: false,
      events: [],
      nextSequence: 1,
      wake: undefined,
    };
    const notify = () => {
      const wake = state.wake;
      state.wake = undefined;
      wake?.();
    };
    const listener = (eventContext: ExecutionContext, event: DeploymentProgressEvent) => {
      if (state.closed || event.deploymentId !== deploymentId) {
        return;
      }

      state.events.push({ context: eventContext, event });
      notify();
    };

    const unsubscribe = this.deploymentProgressObserver.subscribe(listener);
    const onAbort = () => {
      state.abortReason = "cancelled";
      state.closed = true;
      notify();
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      const loadHistoricalEntries = async (): Promise<DeploymentTimelineEntry[]> => {
        const historicalLogs = await this.deploymentReadModel.findTimeline(
          repositoryContext,
          deploymentId,
        );
        return historicalLogs.map((log, index) => ({
          deploymentId,
          sequence: index + 1,
          cursor: timelineCursor(deploymentId, index + 1),
          occurredAt: log.timestamp,
          source: log.source,
          kind: timelineKindFromJournalSource(log.source),
          phase: log.phase,
          level: log.level,
          message: log.message,
          ...(log.level === "error" ? { status: "failed" } : {}),
        }));
      };
      const loadDeploymentStatus = async (): Promise<string | undefined> => {
        const currentDeployment = await this.deploymentReadModel.findOne(
          repositoryContext,
          DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
        );
        return currentDeployment?.status;
      };
      const historicalEntries = await loadHistoricalEntries();

      const cursorSequence = parsedCursor.value;
      if (cursorSequence && cursorSequence > historicalEntries.length) {
        return err(invalidCursorError(deploymentId, request.cursor ?? ""));
      }

      state.nextSequence = historicalEntries.length + 1;
      let replayEntries: DeploymentTimelineEntry[] = [];
      if (request.includeHistory) {
        const filteredEntries = historicalEntries.filter((entry) =>
          entryMatchesRequest(entry, request),
        );

        if (cursorSequence) {
          replayEntries = filteredEntries.slice(cursorSequence, cursorSequence + request.limit);
        } else if (request.limit > 0) {
          replayEntries = filteredEntries.slice(-request.limit);
        }
      }

      const lastHistoricalEntry = historicalEntries.at(-1);
      const lastHistoricalTimestamp = lastHistoricalEntry?.occurredAt;
      if (lastHistoricalTimestamp) {
        state.lastDeliveredAt = lastHistoricalTimestamp;
      }
      const deploymentAlreadyTerminal = isTerminalDeploymentStatus(
        observationContext.deployment.status,
      );

      const stream = createDeploymentTimelineStream({
        close: () => {
          if (state.closed) {
            return;
          }

          state.closed = true;
          unsubscribe();
          signal.removeEventListener("abort", onAbort);
          notify();
        },
        iterate: async function* (): AsyncGenerator<DeploymentTimelineEnvelope, void, void> {
          try {
            for (const entry of replayEntries) {
              state.lastCursor = entry.cursor;
              state.lastDeliveredAt = entry.occurredAt;
              yield entryEnvelope(entry);
            }

            if (!request.follow || (request.untilTerminal && deploymentAlreadyTerminal)) {
              yield closedEnvelope(
                request.untilTerminal && deploymentAlreadyTerminal ? "completed" : "source-ended",
                state.lastCursor ?? request.cursor,
              );
              return;
            }

            while (!state.closed) {
              const nextBuffered = state.events.shift();
              if (nextBuffered) {
                if (
                  state.lastDeliveredAt &&
                  nextBuffered.event.timestamp <= state.lastDeliveredAt
                ) {
                  continue;
                }

                const entry: DeploymentTimelineEntry = {
                  deploymentId,
                  sequence: state.nextSequence,
                  cursor: timelineCursor(deploymentId, state.nextSequence),
                  occurredAt: nextBuffered.event.timestamp,
                  source: timelineSourceFromProgress(nextBuffered.event),
                  kind: timelineKindFromProgress(nextBuffered.event),
                  phase: nextBuffered.event.phase,
                  level: nextBuffered.event.level,
                  message: nextBuffered.event.message,
                  ...(nextBuffered.event.status ? { status: nextBuffered.event.status } : {}),
                  ...(nextBuffered.event.stream ? { stream: nextBuffered.event.stream } : {}),
                  ...(nextBuffered.event.step ? { step: nextBuffered.event.step } : {}),
                };
                state.nextSequence += 1;
                state.lastCursor = entry.cursor;
                state.lastDeliveredAt = entry.occurredAt;

                if (entryMatchesRequest(entry, request)) {
                  yield entryEnvelope(entry);
                }

                if (request.untilTerminal && isTerminalProgressEvent(nextBuffered.event)) {
                  yield closedEnvelope("completed", state.lastCursor);
                  return;
                }

                continue;
              }

              if (signal.aborted || state.abortReason === "cancelled") {
                yield closedEnvelope("cancelled", state.lastCursor ?? request.cursor);
                return;
              }

              await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, persistentRefreshIntervalMs);
                state.wake = resolve;
                state.wake = () => {
                  clearTimeout(timeout);
                  resolve();
                };
                if (state.closed || state.events.length > 0) {
                  notify();
                }
              });

              if (state.closed || state.events.length > 0) {
                continue;
              }

              const refreshedEntries = await loadHistoricalEntries();
              for (const entry of refreshedEntries) {
                if (state.lastDeliveredAt && entry.occurredAt <= state.lastDeliveredAt) {
                  continue;
                }

                state.nextSequence = Math.max(state.nextSequence, entry.sequence + 1);
                state.lastCursor = entry.cursor;
                state.lastDeliveredAt = entry.occurredAt;

                if (entryMatchesRequest(entry, request)) {
                  yield entryEnvelope(entry);
                }
              }

              if (
                request.untilTerminal &&
                isTerminalDeploymentStatus(await loadDeploymentStatus())
              ) {
                yield closedEnvelope("completed", state.lastCursor ?? request.cursor);
                return;
              }
            }

            yield closedEnvelope("source-ended", state.lastCursor ?? request.cursor);
          } finally {
            if (!state.closed) {
              state.closed = true;
            }

            unsubscribe();
            signal.removeEventListener("abort", onAbort);
          }
        },
      });

      return ok(stream);
    } catch (error) {
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      return err(timelineUnavailableError(deploymentId, error));
    }
  }
}
