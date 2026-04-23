import {
  type CreateDeploymentInput,
  type DeploymentEventStreamEnvelope,
  type DeploymentProgressEvent,
} from "@appaloft/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

const { eventsMock, eventsStreamMock } = vi.hoisted(() => ({
  eventsMock: vi.fn(),
  eventsStreamMock: vi.fn(),
}));

vi.mock("$lib/orpc", () => ({
  orpcClient: {
    deployments: {
      events: eventsMock,
      eventsStream: eventsStreamMock,
    },
  },
}));

import {
  createDeploymentWithProgress,
  deploymentEventProgressEvents,
  deploymentEventProgressStatus,
  latestDeploymentEventCursor,
} from "./deployment-progress";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Set<EventListener>>();
  closed = false;

  constructor(
    readonly url: string,
    readonly options?: {
      withCredentials?: boolean;
    },
  ) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("deployment progress helpers", () => {
  afterEach(() => {
    MockEventSource.instances.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    eventsMock.mockReset();
    eventsStreamMock.mockReset();
  });

  test("maps deployment event envelopes into progress events and status", () => {
    const envelopes: DeploymentEventStreamEnvelope[] = [
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          emittedAt: "2026-01-01T00:00:01.000Z",
          source: "progress-projection",
          eventType: "deployment-requested",
          phase: "detect",
          summary: "Deployment requested",
        },
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "heartbeat",
        at: "2026-01-01T00:00:02.000Z",
        cursor: "dep_demo:1",
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "event",
        event: {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "dep_demo:2",
          emittedAt: "2026-01-01T00:00:03.000Z",
          source: "domain-event",
          eventType: "deployment-succeeded",
          phase: "verify",
          summary: "Deployment succeeded",
        },
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "dep_demo:2",
      },
    ];

    const progressEvents = deploymentEventProgressEvents(envelopes);

    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0]).toMatchObject({
      deploymentId: "dep_demo",
      phase: "detect",
      message: "Deployment requested",
      status: "running",
    } satisfies Partial<DeploymentProgressEvent>);
    expect(progressEvents[1]).toMatchObject({
      deploymentId: "dep_demo",
      phase: "verify",
      message: "Deployment succeeded",
      status: "succeeded",
    } satisfies Partial<DeploymentProgressEvent>);
    expect(latestDeploymentEventCursor(envelopes)).toBe("dep_demo:2");
    expect(deploymentEventProgressStatus(envelopes, "running")).toBe("succeeded");
  });

  test("hands off to deployment event replay and follow after create-time acceptance", async () => {
    vi.stubGlobal("EventSource", MockEventSource);

    const createResponse = deferredPromise<Response>();
    const fetchMock = vi.fn(() => createResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    eventsMock.mockResolvedValue({
      deploymentId: "dep_demo",
      envelopes: [
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "event",
          event: {
            deploymentId: "dep_demo",
            sequence: 1,
            cursor: "dep_demo:1",
            emittedAt: "2026-01-01T00:00:01.000Z",
            source: "progress-projection",
            eventType: "deployment-requested",
            phase: "detect",
            summary: "Deployment requested",
          },
        },
        {
          schemaVersion: "deployments.stream-events/v1",
          kind: "event",
          event: {
            deploymentId: "dep_demo",
            sequence: 2,
            cursor: "dep_demo:2",
            emittedAt: "2026-01-01T00:00:02.000Z",
            source: "progress-projection",
            eventType: "build-requested",
            phase: "plan",
            summary: "Build requested",
          },
        },
      ],
    });

    eventsStreamMock.mockResolvedValue(
      (async function* () {
        yield {
          schemaVersion: "deployments.stream-events/v1",
          kind: "event",
          event: {
            deploymentId: "dep_demo",
            sequence: 3,
            cursor: "dep_demo:3",
            emittedAt: "2026-01-01T00:00:03.000Z",
            source: "domain-event",
            eventType: "deployment-succeeded",
            phase: "verify",
            summary: "Deployment succeeded",
          },
        } satisfies DeploymentEventStreamEnvelope;
        yield {
          schemaVersion: "deployments.stream-events/v1",
          kind: "closed",
          reason: "completed",
          cursor: "dep_demo:3",
        } satisfies DeploymentEventStreamEnvelope;
      })(),
    );

    const progressEvents: DeploymentProgressEvent[] = [];
    const input: CreateDeploymentInput = {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
    };

    const resultPromise = createDeploymentWithProgress(input, (event) => {
      progressEvents.push(event);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(1);

    MockEventSource.instances[0]?.emit(
      "progress",
      JSON.stringify({
        timestamp: "2026-01-01T00:00:01.000Z",
        source: "appaloft",
        phase: "detect",
        level: "info",
        message: "Deployment requested",
        deploymentId: "dep_demo",
        status: "running",
        step: {
          current: 1,
          total: 5,
          label: "detect",
        },
      } satisfies DeploymentProgressEvent),
    );

    createResponse.resolve(
      new Response(
        JSON.stringify({
          id: "dep_demo",
        }),
      ),
    );

    await expect(resultPromise).resolves.toEqual({ id: "dep_demo" });

    expect(eventsMock).toHaveBeenCalledWith({
      deploymentId: "dep_demo",
      historyLimit: 100,
      includeHistory: true,
      follow: false,
      untilTerminal: true,
    });
    expect(eventsStreamMock).toHaveBeenCalledWith({
      deploymentId: "dep_demo",
      historyLimit: 0,
      includeHistory: false,
      follow: true,
      untilTerminal: true,
      cursor: "dep_demo:2",
    });
    expect(progressEvents.map((event) => event.message)).toEqual([
      "Deployment requested",
      "Build requested",
      "Deployment succeeded",
    ]);
  });
});
