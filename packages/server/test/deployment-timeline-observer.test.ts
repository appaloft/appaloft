import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type DeploymentProgressEvent,
  type DeploymentProgressListener,
  type DeploymentProgressObserver,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DeploymentTimelineEnvelope,
  type DeploymentTimelineJournalSummary,
  type ExecutionContext,
} from "@appaloft/application";

import { ShellDeploymentTimelineObserver } from "../src/deployment-timeline-observer";

class BufferedProgressObserver implements DeploymentProgressObserver {
  constructor(private readonly events: DeploymentProgressEvent[]) {}

  subscribe(listener: DeploymentProgressListener): () => void {
    const context = createExecutionContext({
      requestId: "req_progress_buffer",
      entrypoint: "system",
    });

    for (const event of this.events) {
      listener(context, event);
    }

    return () => undefined;
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
        kind: "docker-image",
        locator: "example/app:latest",
        displayName: "example/app:latest",
      },
      buildStrategy: "prebuilt-image",
      packagingMode: "all-in-one-docker",
      execution: {
        kind: "docker-container",
        port: 3000,
      },
      target: {
        kind: "single-server",
        providerKey: "generic-ssh",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected docker image",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "plan", "deploy", "verify"],
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
    target: {
      kind: "server-backed",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    },
    ...overrides,
  };
}

function readModel(input: {
  deployment?: DeploymentSummary;
  timeline?: DeploymentTimelineJournalSummary[];
}): DeploymentReadModel {
  return {
    async count() {
      return input.deployment ? 1 : 0;
    },
    async list() {
      return input.deployment ? [input.deployment] : [];
    },
    async findOne() {
      return input.deployment ?? null;
    },
    async findTimeline() {
      return input.timeline ?? [];
    },
  };
}

function progressEvent(input: Partial<DeploymentProgressEvent>): DeploymentProgressEvent {
  return {
    timestamp: "2026-01-01T00:00:11.000Z",
    source: "appaloft",
    phase: "plan",
    level: "info",
    message: "progress",
    deploymentId: "dep_demo",
    step: {
      current: 2,
      total: 5,
      label: "Build runtime plan",
    },
    ...input,
  };
}

async function collect(
  observer: ShellDeploymentTimelineObserver,
  context: ExecutionContext,
): Promise<DeploymentTimelineEnvelope[]> {
  const opened = await observer.open(
    context,
    { deployment: deploymentSummary() },
    {
      limit: 25,
      includeHistory: true,
      follow: true,
      untilTerminal: true,
    },
    new AbortController().signal,
  );
  expect(opened.isOk()).toBe(true);

  const envelopes: DeploymentTimelineEnvelope[] = [];
  for await (const envelope of opened._unsafeUnwrap()) {
    envelopes.push(envelope);
  }

  return envelopes;
}

describe("deployment timeline observer", () => {
  test("[DEP-TIMELINE-STREAM-001] keeps following after step-level succeeded progress", async () => {
    const observer = new ShellDeploymentTimelineObserver(
      readModel({
        deployment: deploymentSummary({
          status: "succeeded",
          finishedAt: "2026-01-01T00:00:13.000Z",
        }),
        timeline: [
          {
            timestamp: "2026-01-01T00:00:10.000Z",
            source: "docker",
            phase: "deploy",
            level: "info",
            message: "latest: Pulling from example/app",
          },
        ],
      }),
      new BufferedProgressObserver([
        progressEvent({
          timestamp: "2026-01-01T00:00:05.000Z",
          source: "docker",
          phase: "deploy",
          message: "stale buffered docker output",
          stream: "stdout",
        }),
        progressEvent({
          timestamp: "2026-01-01T00:00:11.000Z",
          phase: "plan",
          status: "succeeded",
          message: "Build runtime plan succeeded",
        }),
        progressEvent({
          timestamp: "2026-01-01T00:00:12.000Z",
          phase: "verify",
          status: "succeeded",
          message: "Deployment is reachable",
        }),
      ]),
    );

    const envelopes = await collect(
      observer,
      createExecutionContext({
        requestId: "req_timeline_stream_test",
        entrypoint: "system",
      }),
    );
    const entries = envelopes
      .filter((envelope): envelope is Extract<DeploymentTimelineEnvelope, { kind: "entry" }> => {
        return envelope.kind === "entry";
      })
      .map((envelope) => envelope.entry);

    expect(entries.map((entry) => entry.message)).toEqual([
      "latest: Pulling from example/app",
      "Build runtime plan succeeded",
      "Deployment is reachable",
    ]);
    expect(entries[0]).toMatchObject({
      source: "docker",
      kind: "output",
    });
    expect(envelopes.at(-1)).toMatchObject({
      kind: "closed",
      reason: "completed",
    });
  });

  test("[DEP-TIMELINE-STREAM-002] follows persisted timeline to deployment terminal status", async () => {
    let timelineReads = 0;
    const model: DeploymentReadModel = {
      async count() {
        return 1;
      },
      async list() {
        return [deploymentSummary()];
      },
      async findOne() {
        return deploymentSummary({
          status: timelineReads > 1 ? "succeeded" : "running",
          ...(timelineReads > 1 ? { finishedAt: "2026-01-01T00:00:12.000Z" } : {}),
        });
      },
      async findTimeline() {
        timelineReads += 1;
        const entries: DeploymentTimelineJournalSummary[] = [
          {
            timestamp: "2026-01-01T00:00:10.000Z",
            source: "appaloft",
            phase: "verify",
            level: "info",
            message: "Checking public access route",
          },
        ];

        if (timelineReads > 1) {
          entries.push({
            timestamp: "2026-01-01T00:00:12.000Z",
            source: "appaloft",
            phase: "verify",
            level: "info",
            message: "Public route is reachable",
          });
        }

        return entries;
      },
    };
    const observer = new ShellDeploymentTimelineObserver(model, new BufferedProgressObserver([]));

    const envelopes = await collect(
      observer,
      createExecutionContext({
        requestId: "req_timeline_persisted_follow_test",
        entrypoint: "system",
      }),
    );
    const entries = envelopes
      .filter((envelope): envelope is Extract<DeploymentTimelineEnvelope, { kind: "entry" }> => {
        return envelope.kind === "entry";
      })
      .map((envelope) => envelope.entry);

    expect(entries.map((entry) => entry.message)).toEqual([
      "Checking public access route",
      "Public route is reachable",
    ]);
    expect(envelopes.at(-1)).toMatchObject({
      kind: "closed",
      reason: "completed",
    });
  });
});
