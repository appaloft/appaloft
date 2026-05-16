import {
  type DeploymentEventObservationContext,
  type DeploymentEventObservationRequest,
  type DeploymentEventObserver,
  type DeploymentEventStream,
  type DeploymentEventStreamEnvelope,
  type DeploymentLogSummary,
  type DeploymentObservedEvent,
  type DeploymentProgressEvent,
  type DeploymentProgressObserver,
  type DeploymentReadModel,
  type ExecutionContext,
  tokens,
  toRepositoryContext,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

const deploymentEventStreamSchemaVersion = "deployments.stream-events/v1";

type BufferedProgressEvent = {
  context: ExecutionContext;
  event: DeploymentProgressEvent;
};

type DeploymentEventStreamState = {
  abortReason?: "cancelled";
  closed: boolean;
  events: BufferedProgressEvent[];
  lastCursor?: string;
  nextSequence: number;
  wake: (() => void) | undefined;
};

function deploymentEventCursor(deploymentId: string, sequence: number): string {
  return `${deploymentId}:${sequence}`;
}

function invalidCursorError(deploymentId: string, cursor: string): DomainError {
  return {
    code: "deployment_event_cursor_invalid",
    category: "user",
    message: "Deployment event cursor is invalid",
    retryable: false,
    details: {
      queryName: "deployments.stream-events",
      phase: "cursor-resolution",
      deploymentId,
      cursor,
    },
  };
}

function streamUnavailableError(
  deploymentId: string,
  phase: "event-source-load" | "live-follow",
  reason: unknown,
): DomainError {
  return {
    code:
      phase === "event-source-load"
        ? "deployment_event_stream_unavailable"
        : "deployment_event_follow_failed",
    category: "infra",
    message:
      phase === "event-source-load"
        ? "Deployment event stream is unavailable"
        : "Deployment event follow failed",
    retryable: true,
    details: {
      queryName: "deployments.stream-events",
      phase,
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

function eventFingerprint(input: {
  message: string;
  phase: string | undefined;
  source: string;
  status: string | undefined;
  timestamp: string;
}): string {
  return [input.timestamp, input.source, input.phase ?? "", input.status ?? "", input.message].join(
    "|",
  );
}

function inferredEventType(
  phase: DeploymentProgressEvent["phase"],
  status: string | undefined,
  sequence: number,
  message: string,
): DeploymentObservedEvent["eventType"] {
  if (status === "succeeded") {
    return "deployment-succeeded";
  }

  if (status === "failed") {
    return "deployment-failed";
  }

  if (phase === "detect" && sequence === 1) {
    return "deployment-requested";
  }

  if (phase === "plan" && /build/i.test(message)) {
    return "build-requested";
  }

  if (phase === "deploy" && /start|deploy/i.test(message)) {
    return "deployment-started";
  }

  return "deployment-progress";
}

function observedEventFromDeploymentLog(
  deploymentId: string,
  sequence: number,
  log: DeploymentLogSummary,
): DeploymentObservedEvent {
  const status = log.level === "error" ? "failed" : undefined;
  return {
    deploymentId,
    sequence,
    cursor: deploymentEventCursor(deploymentId, sequence),
    emittedAt: log.timestamp,
    source: log.source === "application" ? "process-observation" : "progress-projection",
    eventType: inferredEventType(log.phase, status, sequence, log.message),
    phase: log.phase,
    ...(status ? { status } : {}),
    ...(log.level === "error" ? { retriable: true } : {}),
    summary: log.message,
  };
}

function observedEventFromProgressEvent(
  deploymentId: string,
  sequence: number,
  event: DeploymentProgressEvent,
): DeploymentObservedEvent {
  return {
    deploymentId,
    sequence,
    cursor: deploymentEventCursor(deploymentId, sequence),
    emittedAt: event.timestamp,
    source:
      event.stream || event.source === "application"
        ? "process-observation"
        : "progress-projection",
    eventType: inferredEventType(event.phase, event.status, sequence, event.message),
    phase: event.phase,
    ...(event.status ? { status: event.status } : {}),
    ...(event.status === "failed" ? { retriable: true } : {}),
    summary: event.message,
  };
}

function isTerminalDeploymentStatus(status: string | undefined): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled" ||
    status === "rolled-back"
  );
}

function createDeploymentEventStream(input: {
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

function closedEnvelope(
  reason: "completed" | "cancelled" | "source-ended",
  cursor: string | undefined,
): DeploymentEventStreamEnvelope {
  return {
    schemaVersion: deploymentEventStreamSchemaVersion,
    kind: "closed",
    reason,
    ...(cursor ? { cursor } : {}),
  };
}

@injectable()
export class ShellDeploymentEventObserver implements DeploymentEventObserver {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.deploymentProgressReporter)
    private readonly deploymentProgressObserver: DeploymentProgressObserver,
  ) {}

  async open(
    context: ExecutionContext,
    observationContext: DeploymentEventObservationContext,
    request: DeploymentEventObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DeploymentEventStream>> {
    const deploymentId = observationContext.deployment.id;
    const parsedCursor = parseCursor(deploymentId, request.cursor);
    if (parsedCursor.isErr()) {
      return err(parsedCursor.error);
    }

    const repositoryContext = toRepositoryContext(context);
    const state: DeploymentEventStreamState = {
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
      void eventContext;
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
      const historicalLogs = await this.deploymentReadModel.findLogs(
        repositoryContext,
        deploymentId,
      );
      const historicalEvents: DeploymentObservedEvent[] = [];
      const seenFingerprints = new Set<string>();

      for (const log of historicalLogs) {
        const sequence = historicalEvents.length + 1;
        const observed = observedEventFromDeploymentLog(deploymentId, sequence, log);
        historicalEvents.push(observed);
        seenFingerprints.add(
          eventFingerprint({
            timestamp: observed.emittedAt,
            source: observed.source,
            phase: observed.phase,
            status: observed.status,
            message: observed.summary ?? observed.eventType,
          }),
        );
      }

      const initialBufferedEvents = state.events.splice(0, state.events.length);
      for (const buffered of initialBufferedEvents) {
        const fingerprint = eventFingerprint({
          timestamp: buffered.event.timestamp,
          source:
            buffered.event.stream || buffered.event.source === "application"
              ? "process-observation"
              : "progress-projection",
          phase: buffered.event.phase,
          status: buffered.event.status,
          message: buffered.event.message,
        });

        if (seenFingerprints.has(fingerprint)) {
          continue;
        }

        const sequence = historicalEvents.length + 1;
        const observed = observedEventFromProgressEvent(deploymentId, sequence, buffered.event);
        historicalEvents.push(observed);
        seenFingerprints.add(fingerprint);
      }

      const cursorSequence = parsedCursor.value;
      if (cursorSequence && cursorSequence > historicalEvents.length) {
        return err(invalidCursorError(deploymentId, request.cursor ?? ""));
      }

      state.nextSequence = historicalEvents.length + 1;

      let replayEvents: DeploymentObservedEvent[] = [];
      if (request.includeHistory) {
        if (cursorSequence) {
          replayEvents = historicalEvents.slice(
            cursorSequence,
            cursorSequence + request.historyLimit,
          );
        } else if (request.historyLimit > 0) {
          replayEvents = historicalEvents.slice(-request.historyLimit);
        }
      }

      const lastHistoricalEvent = historicalEvents.at(-1);
      const deploymentAlreadyTerminal =
        isTerminalDeploymentStatus(observationContext.deployment.status) ||
        isTerminalDeploymentStatus(lastHistoricalEvent?.status);

      const stream = createDeploymentEventStream({
        close: () => {
          if (state.closed) {
            return;
          }

          state.closed = true;
          unsubscribe();
          signal.removeEventListener("abort", onAbort);
          notify();
        },
        iterate: async function* (): AsyncGenerator<DeploymentEventStreamEnvelope, void, void> {
          try {
            for (const event of replayEvents) {
              state.lastCursor = event.cursor;
              yield {
                schemaVersion: deploymentEventStreamSchemaVersion,
                kind: "event",
                event,
              };
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
                const event = observedEventFromProgressEvent(
                  deploymentId,
                  state.nextSequence,
                  nextBuffered.event,
                );
                state.nextSequence += 1;
                state.lastCursor = event.cursor;

                yield {
                  schemaVersion: deploymentEventStreamSchemaVersion,
                  kind: "event",
                  event,
                };

                if (request.untilTerminal && isTerminalDeploymentStatus(event.status)) {
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
                state.wake = resolve;
                if (state.closed || state.events.length > 0) {
                  notify();
                }
              });
            }

            if (state.abortReason === "cancelled") {
              yield closedEnvelope("cancelled", state.lastCursor ?? request.cursor);
              return;
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
      return err(streamUnavailableError(deploymentId, "event-source-load", error));
    }
  }
}
