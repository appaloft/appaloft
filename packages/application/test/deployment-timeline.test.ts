import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext } from "../src";
import { DeploymentTimelineQuery, StreamDeploymentTimelineQuery } from "../src/messages";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type DeploymentTimelineEnvelope,
  type DeploymentTimelineObservationContext,
  type DeploymentTimelineObservationRequest,
  type DeploymentTimelineObserver,
  type DeploymentTimelineStream,
} from "../src/ports";
import { DeploymentTimelineQueryService } from "../src/use-cases";

class StaticDeploymentReadModel implements DeploymentReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(): Promise<DeploymentSummary[]> {
    return this.deployments;
  }

  async findTimeline() {
    return [];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return this.deployments[0] ?? null;
  }
}

class StaticDeploymentTimelineStream implements DeploymentTimelineStream {
  closed = false;

  constructor(private readonly envelopes: DeploymentTimelineEnvelope[]) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<DeploymentTimelineEnvelope> {
    for (const envelope of this.envelopes) {
      if (this.closed) {
        return;
      }

      yield envelope;
    }
  }
}

class RecordingDeploymentTimelineObserver implements DeploymentTimelineObserver {
  calls: Array<{
    context: DeploymentTimelineObservationContext;
    request: DeploymentTimelineObservationRequest;
    signal: AbortSignal;
  }> = [];

  constructor(private readonly stream: DeploymentTimelineStream) {}

  async open(
    _context: ExecutionContext,
    observationContext: DeploymentTimelineObservationContext,
    request: DeploymentTimelineObservationRequest,
    signal: AbortSignal,
  ): Promise<Result<DeploymentTimelineStream>> {
    this.calls.push({
      context: observationContext,
      request,
      signal,
    });
    return ok(this.stream);
  }
}

class FailingDeploymentTimelineObserver implements DeploymentTimelineObserver {
  calls = 0;

  async open(): Promise<Result<DeploymentTimelineStream>> {
    this.calls += 1;
    return err({
      code: "deployment_timeline_unavailable",
      category: "infra",
      message: "Deployment timeline is unavailable",
      retryable: true,
      details: {
        phase: "timeline-source-load",
      },
    });
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
    timeline: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    timelineCount: 1,
    ...overrides,
    target: {
      kind: "server-backed",
      serverId: overrides?.serverId ?? "srv_demo",
      destinationId: overrides?.destinationId ?? "dst_demo",
    },
  };
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_deployment_timeline_test",
    entrypoint: "system",
  });
}

function timelineEntry(message: string): DeploymentTimelineEnvelope {
  return {
    schemaVersion: "deployments.timeline/v1",
    kind: "entry",
    entry: {
      deploymentId: "dep_demo",
      sequence: 1,
      cursor: "dep_demo:1",
      occurredAt: "2026-01-01T00:00:01.000Z",
      source: "docker",
      kind: "output",
      phase: "deploy",
      level: "info",
      message,
      stream: "stdout",
    },
  };
}

describe("deployment timeline query service", () => {
  test("[DEP-TIMELINE-001] returns bounded journal entries from the timeline observer", async () => {
    const stream = new StaticDeploymentTimelineStream([timelineEntry("Pulling image")]);
    const observer = new RecordingDeploymentTimelineObserver(stream);
    const service = new DeploymentTimelineQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      observer,
    );

    const result = await service.read(
      createTestContext(),
      DeploymentTimelineQuery.create({
        deploymentId: "dep_demo",
        limit: 25,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: "dep_demo",
      entries: [
        {
          source: "docker",
          kind: "output",
          message: "Pulling image",
        },
      ],
    });
    expect(observer.calls[0]?.request).toMatchObject({
      follow: false,
      includeHistory: true,
      limit: 25,
    });
  });

  test("[DEP-TIMELINE-003] forwards log-view filters as timeline kind/source filters", async () => {
    const observer = new RecordingDeploymentTimelineObserver(
      new StaticDeploymentTimelineStream([timelineEntry("stdout")]),
    );
    const service = new DeploymentTimelineQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      observer,
    );

    const result = await service.read(
      createTestContext(),
      DeploymentTimelineQuery.create({
        deploymentId: "dep_demo",
        kinds: ["output", "container-log"],
        sources: ["docker", "application"],
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(observer.calls[0]?.request).toMatchObject({
      kinds: ["output", "container-log"],
      sources: ["docker", "application"],
    });
  });

  test("[DEP-TIMELINE-004] returns a live stream when follow is requested", async () => {
    const observer = new RecordingDeploymentTimelineObserver(
      new StaticDeploymentTimelineStream([timelineEntry("Deploying")]),
    );
    const service = new DeploymentTimelineQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      observer,
    );

    const result = await service.stream(
      createTestContext(),
      StreamDeploymentTimelineQuery.create({
        deploymentId: "dep_demo",
        follow: true,
        includeHistory: true,
        untilTerminal: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().mode).toBe("stream");
    expect(observer.calls[0]?.request.follow).toBe(true);
  });

  test("[DEP-TIMELINE-004] returns not_found before opening the observer", async () => {
    const observer = new RecordingDeploymentTimelineObserver(
      new StaticDeploymentTimelineStream([]),
    );
    const service = new DeploymentTimelineQueryService(new StaticDeploymentReadModel([]), observer);

    const result = await service.stream(
      createTestContext(),
      StreamDeploymentTimelineQuery.create({
        deploymentId: "dep_missing",
        follow: false,
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
    expect(observer.calls).toHaveLength(0);
  });

  test("[DEP-TIMELINE-005] reads the deployment timeline observer, not a domain-event stream reader", async () => {
    const observer = new FailingDeploymentTimelineObserver();
    const service = new DeploymentTimelineQueryService(
      new StaticDeploymentReadModel([deploymentSummary()]),
      observer,
    );

    const result = await service.stream(
      createTestContext(),
      StreamDeploymentTimelineQuery.create({
        deploymentId: "dep_demo",
        follow: false,
      })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_timeline_unavailable",
      details: {
        phase: "timeline-source-load",
      },
    });
    expect(observer.calls).toBe(1);
  });
});
