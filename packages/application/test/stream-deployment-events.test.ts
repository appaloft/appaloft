import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type RepositoryContext } from "../src";
import { StreamDeploymentEventsQuery } from "../src/messages";
import {
  type DeploymentEventObservationContext,
  type DeploymentEventObservationRequest,
  type DeploymentEventObserver,
  type DeploymentEventStream,
  type DeploymentEventStreamEnvelope,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainEventStreamObservationReader,
  type DomainEventStreamObservationReplayResult,
  type DomainEventStreamObservationRequest,
} from "../src/ports";
import { StreamDeploymentEventsQueryService } from "../src/use-cases";

class StaticDeploymentReadModel implements DeploymentReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(
    private readonly deployments: DeploymentSummary[],
    private readonly logs: DeploymentLogSummary[] = [],
  ) {}

  async list(): Promise<DeploymentSummary[]> {
    return this.deployments;
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return this.logs;
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return this.deployments[0] ?? null;
  }
}

class StaticDeploymentEventStream implements DeploymentEventStream {
  closed = false;

  constructor(private readonly envelopes: DeploymentEventStreamEnvelope[]) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<DeploymentEventStreamEnvelope> {
    for (const envelope of this.envelopes) {
      if (this.closed) {
        return;
      }

      yield envelope;
    }
  }
}

class ThrowingDeploymentEventStream implements DeploymentEventStream {
  closed = false;

  async close(): Promise<void> {
    this.closed = true;
  }

  [Symbol.asyncIterator](): AsyncIterator<DeploymentEventStreamEnvelope> {
    return {
      async next(): Promise<IteratorResult<DeploymentEventStreamEnvelope>> {
        throw new Error("stream exploded");
      },
    };
  }
}

class RecordingDeploymentEventObserver implements DeploymentEventObserver {
  calls: Array<{
    context: DeploymentEventObservationContext;
    request: DeploymentEventObservationRequest;
    signal: AbortSignal;
  }> = [];

  constructor(private readonly stream: DeploymentEventStream) {}

  async open(
    _context: ExecutionContext,
    observationContext: DeploymentEventObservationContext,
    request: DeploymentEventObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DeploymentEventStream>> {
    this.calls.push({
      context: observationContext,
      request,
      signal,
    });
    return ok(this.stream);
  }
}

class FailingDeploymentEventObserver implements DeploymentEventObserver {
  calls = 0;

  async open(): Promise<Result<DeploymentEventStream>> {
    this.calls += 1;
    return err({
      code: "deployment_event_stream_unavailable",
      category: "infra",
      message: "Deployment event stream is unavailable",
      retryable: true,
      details: {
        phase: "event-source-load",
      },
    });
  }
}

class StaticDomainEventStreamObservationReader implements DomainEventStreamObservationReader {
  calls: DomainEventStreamObservationRequest[] = [];
  streamCalls: DomainEventStreamObservationRequest[] = [];

  constructor(
    private readonly result: DomainEventStreamObservationReplayResult,
    private readonly streamResult: DeploymentEventStream | null = null,
  ) {}

  async replayDeploymentEvents(
    _context: RepositoryContext,
    request: DomainEventStreamObservationRequest,
  ): Promise<Result<DomainEventStreamObservationReplayResult>> {
    this.calls.push(request);
    return ok(this.result);
  }

  async openDeploymentEventStream(
    _context: RepositoryContext,
    request: DomainEventStreamObservationRequest,
    _signal: AbortSignal,
  ): Promise<Result<DomainEventStreamObservationReplayResult | DeploymentEventStream>> {
    this.streamCalls.push(request);
    return ok(this.streamResult ?? this.result);
  }
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_demo",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "running",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "deploy"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    logCount: 1,
    ...overrides,
  };
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_stream_deployment_events_test",
    entrypoint: "system",
  });
}

describe("stream deployment events query service", () => {
  test("[DEP-EVENTS-QRY-001] returns bounded replay envelopes for non-follow requests", async () => {
    const stream = new StaticDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          emittedAt: "2026-01-01T00:00:01.000Z",
          source: "progress-projection",
          eventType: "deployment-progress",
          phase: "deploy",
          summary: "Deploying",
        },
      },
    ]);
    const reader = new RecordingDeploymentEventObserver(stream);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      reader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: false,
        historyLimit: 25,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("bounded");
    if (output.mode === "bounded") {
      expect(output.envelopes).toHaveLength(1);
    }
    expect(reader.calls).toHaveLength(1);
    expect(reader.calls[0]?.request).toMatchObject({
      follow: false,
      historyLimit: 25,
      includeHistory: true,
      untilTerminal: true,
    });
  });

  test("[DEP-EVENTS-QRY-002] returns not_found when the deployment does not exist", async () => {
    const reader = new RecordingDeploymentEventObserver(new StaticDeploymentEventStream([]));
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([]),
      reader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_missing",
        follow: false,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
    expect(reader.calls).toHaveLength(0);
  });

  test("[DEP-EVENTS-STREAM-001] returns a live stream when follow is requested", async () => {
    const stream = new StaticDeploymentEventStream([]);
    const reader = new RecordingDeploymentEventObserver(stream);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      reader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: true,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().mode).toBe("stream");
    expect(reader.calls[0]?.request.follow).toBe(true);
  });

  test("[DEP-EVENTS-QRY-005] returns a source-unavailable startup error", async () => {
    const reader = new FailingDeploymentEventObserver();
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      reader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: false,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_event_stream_unavailable",
      details: {
        queryName: "deployments.stream-events",
        phase: "event-source-load",
        deploymentId: "dep_demo",
      },
    });
    expect(reader.calls).toBe(1);
  });

  test("[DEP-EVENTS-QRY-007] finite historical-only replay closes the source", async () => {
    const stream = new StaticDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          emittedAt: "2026-01-01T00:00:01.000Z",
          source: "progress-projection",
          eventType: "deployment-progress",
          phase: "deploy",
          summary: "Deploying",
        },
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "source-ended",
        cursor: "dep_demo:1",
      },
    ]);
    const reader = new RecordingDeploymentEventObserver(stream);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      reader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: false,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: false,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("bounded");
    if (output.mode === "bounded") {
      expect(output.envelopes.at(-1)).toMatchObject({
        kind: "closed",
        reason: "source-ended",
      });
    }
    expect(stream.closed).toBe(true);
  });

  test("[DEP-EVENTS-QRY-008][DEP-EVENTS-OWN-001][DEP-EVENTS-OWN-003][DEP-EVENTS-OWN-004] event stream returns structured envelopes only", async () => {
    const stream = new StaticDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          emittedAt: "2026-01-01T00:00:01.000Z",
          source: "progress-projection",
          eventType: "deployment-progress",
          phase: "deploy",
          summary: "Deploying",
        },
      },
    ]);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel(
        [deploymentSummary()],
        [
          {
            timestamp: "2026-01-01T00:00:01.000Z",
            source: "application",
            phase: "deploy",
            level: "info",
            message: "raw container log line",
          },
        ],
      ),
      new RecordingDeploymentEventObserver(stream),
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: false,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("bounded");
    if (output.mode === "bounded") {
      expect(output.envelopes).toHaveLength(1);
      expect(output.envelopes[0]?.kind).toBe("event");
      expect(JSON.stringify(output.envelopes)).not.toContain("runtimePlan");
      expect(JSON.stringify(output.envelopes)).not.toContain("raw container log line");
      expect(JSON.stringify(output.envelopes)).not.toContain("deployments.retry");
      expect(JSON.stringify(output.envelopes)).not.toContain("deployments.redeploy");
      expect(JSON.stringify(output.envelopes)).not.toContain("deployments.rollback");
      expect(JSON.stringify(output.envelopes)).not.toContain("deployments.cancel");
    }
  });

  test("[DEP-EVENTS-STREAM-002] preserves heartbeat envelopes in follow mode", async () => {
    const stream = new StaticDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "heartbeat",
        at: "2026-01-01T00:00:02.000Z",
        cursor: "dep_demo:1",
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "idle-timeout",
        cursor: "dep_demo:1",
      },
    ]);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      new RecordingDeploymentEventObserver(stream),
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: true,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("stream");
    if (output.mode === "stream") {
      const envelopes: DeploymentEventStreamEnvelope[] = [];
      for await (const envelope of output.stream) {
        envelopes.push(envelope);
      }
      expect(envelopes.map((envelope) => envelope.kind)).toEqual(["heartbeat", "closed"]);
    }
  });

  test("[DEP-EVENTS-STREAM-006] preserves post-open follow error envelopes", async () => {
    const stream = new StaticDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "error",
        error: {
          code: "deployment_event_follow_failed",
          category: "infra",
          message: "Deployment event follow failed",
          retryable: true,
          details: {
            queryName: "deployments.stream-events",
            phase: "live-follow",
            deploymentId: "dep_demo",
          },
        },
      },
    ]);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      new RecordingDeploymentEventObserver(stream),
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        follow: true,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("stream");
    if (output.mode === "stream") {
      const envelopes: DeploymentEventStreamEnvelope[] = [];
      for await (const envelope of output.stream) {
        envelopes.push(envelope);
      }
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]).toMatchObject({
        kind: "error",
        error: {
          code: "deployment_event_follow_failed",
          details: {
            phase: "live-follow",
          },
        },
      });
    }
  });

  test("[DEP-EVENTS-OWN-002] reconnect remains read-only query delegation", async () => {
    const stream = new StaticDeploymentEventStream([]);
    const reader = new RecordingDeploymentEventObserver(stream);
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      reader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        cursor: "dep_demo:1",
        follow: true,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(reader.calls).toHaveLength(1);
    expect(reader.calls[0]?.request).toMatchObject({
      cursor: "dep_demo:1",
      follow: true,
    });
  });

  test("[DEP-EVENTS-QRY-005] converts bounded replay iterator failures to structured replay errors", async () => {
    const stream = new ThrowingDeploymentEventStream();
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      new RecordingDeploymentEventObserver(stream),
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        cursor: "dep_demo:1",
        follow: false,
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_event_replay_failed",
      details: {
        queryName: "deployments.stream-events",
        phase: "event-replay",
        deploymentId: "dep_demo",
        cursor: "dep_demo:1",
      },
    });
    expect(stream.closed).toBe(true);
  });

  test("[DOMAIN-EVENT-RETENTION-005][DEP-EVENTS-STREAM-005] bounded replay prefers retained stream gap envelopes", async () => {
    const legacyObserver = new RecordingDeploymentEventObserver(
      new StaticDeploymentEventStream([
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "event",
          event: {
            deploymentId: "dep_demo",
            sequence: 1,
            cursor: "dep_demo:1",
            emittedAt: "2026-01-01T00:00:01.000Z",
            source: "progress-projection",
            eventType: "deployment-progress",
            phase: "deploy",
            summary: "Legacy replay should not be used",
          },
        },
      ]),
    );
    const retainedReader = new StaticDomainEventStreamObservationReader({
      available: true,
      envelopes: [
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "gap",
          gap: {
            code: "deployment_event_stream_gap",
            phase: "event-replay",
            retriable: true,
            cursor: "evt_pruned",
            recommendedAction: "restart-stream",
          },
        },
      ],
    });
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      legacyObserver,
      retainedReader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        cursor: "evt_pruned",
        follow: false,
        historyLimit: 25,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("bounded");
    if (output.mode === "bounded") {
      expect(output.envelopes).toEqual([
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "gap",
          gap: {
            code: "deployment_event_stream_gap",
            phase: "event-replay",
            retriable: true,
            cursor: "evt_pruned",
            recommendedAction: "restart-stream",
          },
        },
      ]);
    }
    expect(retainedReader.calls).toHaveLength(1);
    expect(legacyObserver.calls).toHaveLength(0);
  });

  test("[DOMAIN-EVENT-RETENTION-005] follow mode prefers retained stream cursor continuation", async () => {
    const legacyObserver = new RecordingDeploymentEventObserver(
      new StaticDeploymentEventStream([
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "event",
          event: {
            deploymentId: "dep_demo",
            sequence: 1,
            cursor: "dep_demo:1",
            emittedAt: "2026-01-01T00:00:01.000Z",
            source: "progress-projection",
            eventType: "deployment-progress",
            phase: "deploy",
            summary: "Legacy follow should not be used",
          },
        },
      ]),
    );
    const retainedStream = new StaticDeploymentEventStream([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "evt_002",
          emittedAt: "2026-01-01T00:00:02.000Z",
          source: "domain-event",
          eventType: "deployment-succeeded",
          phase: "verify",
          status: "succeeded",
          summary: "Deployment succeeded",
        },
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "evt_002",
      },
    ]);
    const retainedReader = new StaticDomainEventStreamObservationReader(
      {
        available: false,
      },
      retainedStream,
    );
    const service = new StreamDeploymentEventsQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      legacyObserver,
      retainedReader,
    );

    const result = await service.execute(
      createTestContext(),
      StreamDeploymentEventsQuery.create({
        deploymentId: "dep_demo",
        cursor: "evt_001",
        follow: true,
        historyLimit: 25,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("stream");
    if (output.mode === "stream") {
      const envelopes: DeploymentEventStreamEnvelope[] = [];
      for await (const envelope of output.stream) {
        envelopes.push(envelope);
      }
      expect(envelopes).toEqual([
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "event",
          event: {
            deploymentId: "dep_demo",
            sequence: 2,
            cursor: "evt_002",
            emittedAt: "2026-01-01T00:00:02.000Z",
            source: "domain-event",
            eventType: "deployment-succeeded",
            phase: "verify",
            status: "succeeded",
            summary: "Deployment succeeded",
          },
        },
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "closed",
          reason: "completed",
          cursor: "evt_002",
        },
      ]);
    }
    expect(retainedReader.streamCalls).toHaveLength(1);
    expect(retainedReader.streamCalls[0]).toMatchObject({
      deploymentId: "dep_demo",
      cursor: "evt_001",
      historyLimit: 25,
      includeHistory: true,
      untilTerminal: true,
    });
    expect(legacyObserver.calls).toHaveLength(0);
  });
});
