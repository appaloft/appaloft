import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext } from "../src";
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
} from "../src/ports";
import { StreamDeploymentEventsQueryService } from "../src/use-cases";

class StaticDeploymentReadModel implements DeploymentReadModel {
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
});
