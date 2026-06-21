import {
  type CreateDeploymentInput,
  type DeploymentProgressEvent,
  type DeploymentTimelineEnvelope,
  type DeploymentTimelineResponse,
} from "@appaloft/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

const { timelineMock, timelineStreamMock } = vi.hoisted(() => ({
  timelineMock: vi.fn(),
  timelineStreamMock: vi.fn(),
}));

vi.mock("$lib/orpc", () => ({
  orpcClient: {
    deployments: {
      timeline: timelineMock,
      timelineStream: timelineStreamMock,
    },
  },
}));

import {
  createDeploymentWithProgress,
  deploymentTimelineEntries,
  deploymentTimelineEnvelope,
  deploymentTimelineProgressEvents,
  deploymentTimelineProgressStatus,
  latestDeploymentTimelineCursor,
  observeDeploymentProgressAfterAcceptance,
  progressSourceLabel,
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
    timelineMock.mockReset();
    timelineStreamMock.mockReset();
  });

  test("maps deployment event envelopes into progress events and status", () => {
    const envelopes: DeploymentTimelineEnvelope[] = [
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          occurredAt: "2026-01-01T00:00:01.000Z",
          source: "appaloft",
          kind: "lifecycle",
          phase: "detect",
          level: "info",
          message: "Deployment requested",
          status: "running",
        },
      },
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "heartbeat",
        at: "2026-01-01T00:00:02.000Z",
        cursor: "dep_demo:1",
      },
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "dep_demo:2",
          occurredAt: "2026-01-01T00:00:03.000Z",
          source: "docker",
          kind: "output",
          phase: "deploy",
          level: "info",
          message: "Pulled image layer",
          stream: "stdout",
        },
      },
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 3,
          cursor: "dep_demo:3",
          occurredAt: "2026-01-01T00:00:04.000Z",
          source: "domain-event",
          kind: "status",
          phase: "verify",
          level: "info",
          message: "Deployment succeeded",
          status: "succeeded",
        },
      },
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "closed",
        reason: "completed",
        cursor: "dep_demo:3",
      },
    ];

    const progressEvents = deploymentTimelineProgressEvents(envelopes);

    expect(progressEvents).toHaveLength(3);
    expect(progressEvents[0]).toMatchObject({
      deploymentId: "dep_demo",
      source: "appaloft",
      phase: "detect",
      message: "Deployment requested",
      status: "running",
    } satisfies Partial<DeploymentProgressEvent>);
    expect(progressEvents[1]).toMatchObject({
      deploymentId: "dep_demo",
      source: "docker",
      phase: "deploy",
      message: "Pulled image layer",
      stream: "stdout",
    } satisfies Partial<DeploymentProgressEvent>);
    expect(progressSourceLabel(progressEvents[1] as DeploymentProgressEvent)).toBe("docker:stdout");
    expect(progressEvents[2]).toMatchObject({
      deploymentId: "dep_demo",
      source: "domain-event",
      phase: "verify",
      message: "Deployment succeeded",
      status: "succeeded",
    } satisfies Partial<DeploymentProgressEvent>);
    expect(latestDeploymentTimelineCursor(envelopes)).toBe("dep_demo:3");
    expect(deploymentTimelineProgressStatus(envelopes, "running")).toBe("running");
    expect(deploymentTimelineProgressStatus(envelopes, "succeeded")).toBe("succeeded");
  });

  test("[DEP-TIMELINE-WEB-001] reads raw ORPC envelope timeline responses at the UI boundary", () => {
    const response = {
      json: {
        schemaVersion: "deployments.timeline/v1",
        deploymentId: "dep_demo",
        hasMore: false,
        entries: [
          {
            deploymentId: "dep_demo",
            sequence: 1,
            cursor: "dep_demo:1",
            occurredAt: "2026-01-01T00:00:01.000Z",
            source: "docker",
            kind: "output",
            phase: "deploy",
            level: "info",
            message: "latest: Pulling from muchobien/pocketbase",
          },
        ],
      },
    } satisfies { json: DeploymentTimelineResponse };

    expect(deploymentTimelineEntries(response)).toMatchObject([
      {
        deploymentId: "dep_demo",
        sequence: 1,
        source: "docker",
        message: "latest: Pulling from muchobien/pocketbase",
      },
    ]);
  });

  test("[DEP-TIMELINE-WEB-001B] reads ORPC timeline responses with transport metadata", () => {
    const response = {
      json: {
        schemaVersion: "deployments.timeline/v1",
        deploymentId: "dep_demo",
        hasMore: false,
        entries: [
          {
            deploymentId: "dep_demo",
            sequence: 1,
            cursor: "dep_demo:1",
            occurredAt: "2026-01-01T00:00:01.000Z",
            source: "docker",
            kind: "output",
            phase: "deploy",
            level: "info",
            message: "latest: Pulling from muchobien/pocketbase",
          },
          {
            deploymentId: "dep_demo",
            sequence: 2,
            cursor: "dep_demo:2",
            occurredAt: "2026-01-01T00:00:02.000Z",
            source: "appaloft",
            kind: "health-check",
            phase: "verify",
            level: "info",
            message: "SSH public route is reachable at http://demo.example.test/api/health",
          },
        ],
      },
      meta: {
        transport: "orpc",
      },
    } as unknown as { json: DeploymentTimelineResponse };

    expect(deploymentTimelineEntries(response).map((entry) => entry.message)).toEqual([
      "latest: Pulling from muchobien/pocketbase",
      "SSH public route is reachable at http://demo.example.test/api/health",
    ]);
  });

  test("[DEP-TIMELINE-WEB-002] reads raw ORPC envelope timeline stream values at the UI boundary", () => {
    const envelope = {
      json: {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 3,
          cursor: "dep_demo:3",
          occurredAt: "2026-01-01T00:00:03.000Z",
          source: "docker",
          kind: "output",
          phase: "deploy",
          level: "info",
          message: "latest: Pulling from muchobien/pocketbase",
        },
      },
    } satisfies { json: DeploymentTimelineEnvelope };

    const parsedEnvelope = deploymentTimelineEnvelope(envelope);

    expect(parsedEnvelope).toMatchObject({
      kind: "entry",
      entry: {
        deploymentId: "dep_demo",
        source: "docker",
        message: "latest: Pulling from muchobien/pocketbase",
      },
    });
    expect(deploymentTimelineProgressEvents(parsedEnvelope ? [parsedEnvelope] : [])).toMatchObject([
      {
        deploymentId: "dep_demo",
        source: "docker",
        phase: "deploy",
        message: "latest: Pulling from muchobien/pocketbase",
      },
    ]);
  });

  test("[DEP-TIMELINE-WEB-003] replays rich docker, proxy, and health timeline rows", () => {
    const response = {
      json: {
        schemaVersion: "deployments.timeline/v1",
        deploymentId: "dep_demo",
        hasMore: false,
        nextCursor: "dep_demo:6",
        entries: [
          {
            deploymentId: "dep_demo",
            sequence: 1,
            cursor: "dep_demo:1",
            occurredAt: "2026-01-01T00:00:01.000Z",
            source: "appaloft",
            kind: "lifecycle",
            phase: "plan",
            level: "info",
            message: "Using SSH docker-container execution on root@2.25.182.56:22",
          },
          {
            deploymentId: "dep_demo",
            sequence: 2,
            cursor: "dep_demo:2",
            occurredAt: "2026-01-01T00:00:02.000Z",
            source: "appaloft",
            kind: "lifecycle",
            phase: "deploy",
            level: "info",
            message: "Ensure Traefik edge proxy on Docker network appaloft-edge",
          },
          {
            deploymentId: "dep_demo",
            sequence: 3,
            cursor: "dep_demo:3",
            occurredAt: "2026-01-01T00:00:03.000Z",
            source: "docker",
            kind: "output",
            phase: "deploy",
            level: "info",
            message: "latest: Pulling from muchobien/pocketbase",
          },
          {
            deploymentId: "dep_demo",
            sequence: 4,
            cursor: "dep_demo:4",
            occurredAt: "2026-01-01T00:00:04.000Z",
            source: "appaloft",
            kind: "lifecycle",
            phase: "verify",
            level: "info",
            message: "SSH container is reachable internally at http://172.18.0.25:8090/api/health",
          },
          {
            deploymentId: "dep_demo",
            sequence: 5,
            cursor: "dep_demo:5",
            occurredAt: "2026-01-01T00:00:05.000Z",
            source: "appaloft",
            kind: "lifecycle",
            phase: "verify",
            level: "info",
            message: "SSH public route is reachable at http://demo.example.test/api/health",
          },
          {
            deploymentId: "dep_demo",
            sequence: 6,
            cursor: "dep_demo:6",
            occurredAt: "2026-01-01T00:00:06.000Z",
            source: "domain-event",
            kind: "status",
            phase: "verify",
            level: "info",
            message: "succeeded",
            status: "succeeded",
          },
        ],
      },
    } satisfies { json: DeploymentTimelineResponse };

    const replayEnvelopes = deploymentTimelineEntries(response).map(
      (entry) =>
        ({
          schemaVersion: "deployments.timeline/v1",
          kind: "entry",
          entry,
        }) satisfies DeploymentTimelineEnvelope,
    );
    const progressEvents = deploymentTimelineProgressEvents(replayEnvelopes);

    expect(progressEvents).toHaveLength(6);
    expect(progressEvents.map((event) => event.message)).toEqual([
      "Using SSH docker-container execution on root@2.25.182.56:22",
      "Ensure Traefik edge proxy on Docker network appaloft-edge",
      "latest: Pulling from muchobien/pocketbase",
      "SSH container is reachable internally at http://172.18.0.25:8090/api/health",
      "SSH public route is reachable at http://demo.example.test/api/health",
      "succeeded",
    ]);
    expect(progressEvents[2]?.source).toBe("docker");
    expect(deploymentTimelineProgressStatus(replayEnvelopes, "running")).toBe("succeeded");
    expect(deploymentTimelineProgressStatus(replayEnvelopes, "succeeded")).toBe("succeeded");
  });

  test("[DEP-TIMELINE-WEB-003B] only treats verify reachability success as deployment completion", () => {
    const envelopes: DeploymentTimelineEnvelope[] = [
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          occurredAt: "2026-01-01T00:00:01.000Z",
          source: "appaloft",
          kind: "status",
          phase: "plan",
          level: "info",
          message: "Build runtime plan succeeded",
          status: "succeeded",
        },
      },
    ];

    expect(deploymentTimelineProgressStatus(envelopes, "running")).toBe("running");

    const reachableEnvelopes: DeploymentTimelineEnvelope[] = [
      ...envelopes,
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "dep_demo:2",
          occurredAt: "2026-01-01T00:00:02.000Z",
          source: "appaloft",
          kind: "status",
          phase: "verify",
          level: "info",
          message: "SSH public route is reachable at http://demo.example.test/api/health",
        },
      },
    ];

    expect(deploymentTimelineProgressStatus(reachableEnvelopes, "running")).toBe("succeeded");
  });

  test("[DEP-TIMELINE-WEB-003C] sorts displayed timeline rows by occurrence time", () => {
    const envelopes: DeploymentTimelineEnvelope[] = [
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          occurredAt: "2026-01-01T00:00:10.000Z",
          source: "appaloft",
          kind: "lifecycle",
          phase: "verify",
          level: "info",
          message: "SSH public route is reachable at http://demo.example.test/api/health",
        },
      },
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "dep_demo:2",
          occurredAt: "2026-01-01T00:00:03.000Z",
          source: "appaloft",
          kind: "lifecycle",
          phase: "deploy",
          level: "info",
          message: "Reload Traefik edge proxy",
        },
      },
      {
        schemaVersion: "deployments.timeline/v1",
        kind: "entry",
        entry: {
          deploymentId: "dep_demo",
          sequence: 3,
          cursor: "dep_demo:3",
          occurredAt: "2026-01-01T00:00:03.000Z",
          source: "appaloft",
          kind: "lifecycle",
          phase: "deploy",
          level: "info",
          message: "Traefik edge proxy reload is complete",
        },
      },
    ];

    expect(deploymentTimelineProgressEvents(envelopes).map((event) => event.message)).toEqual([
      "Reload Traefik edge proxy",
      "Traefik edge proxy reload is complete",
      "SSH public route is reachable at http://demo.example.test/api/health",
    ]);
    expect(latestDeploymentTimelineCursor(envelopes)).toBe("dep_demo:3");
  });

  test("[DEP-TIMELINE-WEB-004] normalizes persisted timestamp timeline rows for deployment detail replay", () => {
    const response = {
      json: {
        json: {
          schemaVersion: "deployments.timeline/v1",
          deploymentId: "dep_demo",
          hasMore: false,
          entries: [
            {
              deploymentId: "dep_demo",
              sequence: 1,
              cursor: "dep_demo:1",
              timestamp: "2026-01-01T00:00:01.000Z",
              source: "appaloft",
              kind: "lifecycle",
              phase: "deploy",
              level: "info",
              message: "Ensure Traefik edge proxy on Docker network appaloft-edge",
            },
            {
              deploymentId: "dep_demo",
              sequence: 2,
              cursor: "dep_demo:2",
              timestamp: "2026-01-01T00:00:02.000Z",
              source: "docker",
              kind: "output",
              phase: "deploy",
              level: "info",
              message: "latest: Pulling from muchobien/pocketbase",
            },
            {
              deploymentId: "dep_demo",
              sequence: 3,
              cursor: "dep_demo:3",
              timestamp: "2026-01-01T00:00:03.000Z",
              source: "appaloft",
              kind: "lifecycle",
              phase: "verify",
              level: "info",
              message: "SSH public route is reachable at http://demo.example.test/api/health",
            },
          ],
        },
      },
    } as unknown as { json: DeploymentTimelineResponse };

    const replayEnvelopes = deploymentTimelineEntries(response).map(
      (entry) =>
        ({
          schemaVersion: "deployments.timeline/v1",
          kind: "entry",
          entry,
        }) satisfies DeploymentTimelineEnvelope,
    );
    const progressEvents = deploymentTimelineProgressEvents(replayEnvelopes);

    expect(progressEvents.map((event) => event.timestamp)).toEqual([
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z",
      "2026-01-01T00:00:03.000Z",
    ]);
    expect(progressEvents.map((event) => event.message)).toEqual([
      "Ensure Traefik edge proxy on Docker network appaloft-edge",
      "latest: Pulling from muchobien/pocketbase",
      "SSH public route is reachable at http://demo.example.test/api/health",
    ]);
    expect(progressEvents[1]?.source).toBe("docker");
  });

  test("[DEP-TIMELINE-WEB-005] normalizes persisted timestamp stream envelopes", () => {
    const envelope = {
      json: {
        json: {
          schemaVersion: "deployments.timeline/v1",
          kind: "entry",
          entry: {
            deploymentId: "dep_demo",
            sequence: 4,
            cursor: "dep_demo:4",
            timestamp: "2026-01-01T00:00:04.000Z",
            source: "appaloft",
            kind: "lifecycle",
            phase: "verify",
            level: "info",
            message: "SSH container is reachable internally at http://172.18.0.26:8090/api/health",
          },
        },
      },
    } as unknown as { json: DeploymentTimelineEnvelope };

    const parsedEnvelope = deploymentTimelineEnvelope(envelope);

    expect(parsedEnvelope).toMatchObject({
      kind: "entry",
      entry: {
        occurredAt: "2026-01-01T00:00:04.000Z",
        message: "SSH container is reachable internally at http://172.18.0.26:8090/api/health",
      },
    });
    expect(deploymentTimelineProgressEvents(parsedEnvelope ? [parsedEnvelope] : [])).toMatchObject([
      {
        timestamp: "2026-01-01T00:00:04.000Z",
        phase: "verify",
        message: "SSH container is reachable internally at http://172.18.0.26:8090/api/health",
      },
    ]);
  });

  test("hands off to deployment event replay and follow after create-time acceptance", async () => {
    vi.stubGlobal("EventSource", MockEventSource);

    const createResponse = deferredPromise<Response>();
    const fetchMock = vi.fn(() => createResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    timelineMock.mockResolvedValue({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: "dep_demo",
      hasMore: false,
      entries: [
        {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          occurredAt: "2026-01-01T00:00:01.000Z",
          source: "appaloft",
          kind: "lifecycle",
          phase: "detect",
          level: "info",
          message: "Deployment requested",
          status: "running",
        },
        {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "dep_demo:2",
          occurredAt: "2026-01-01T00:00:02.000Z",
          source: "appaloft",
          kind: "step",
          phase: "plan",
          level: "info",
          message: "Build requested",
          status: "running",
        },
      ],
    });

    timelineStreamMock.mockResolvedValue(
      (async function* () {
        yield {
          schemaVersion: "deployments.timeline/v1",
          kind: "entry",
          entry: {
            deploymentId: "dep_demo",
            sequence: 3,
            cursor: "dep_demo:3",
            occurredAt: "2026-01-01T00:00:03.000Z",
            source: "domain-event",
            kind: "status",
            phase: "verify",
            level: "info",
            message: "Deployment succeeded",
            status: "succeeded",
          },
        } satisfies DeploymentTimelineEnvelope;
        yield {
          schemaVersion: "deployments.timeline/v1",
          kind: "closed",
          reason: "completed",
          cursor: "dep_demo:3",
        } satisfies DeploymentTimelineEnvelope;
      })(),
    );

    const progressEvents: DeploymentProgressEvent[] = [];
    const traceLinkSpy = vi.fn();
    const input: CreateDeploymentInput = {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
    };

    const resultPromise = createDeploymentWithProgress(
      input,
      (event) => {
        progressEvents.push(event);
      },
      {
        onTraceLink: traceLinkSpy,
      },
    );

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
        {
          headers: {
            link: '<http://localhost:16686/trace/abc123>; rel="trace"',
          },
        },
      ),
    );

    await expect(resultPromise).resolves.toEqual({ id: "dep_demo" });
    expect(traceLinkSpy).toHaveBeenCalledWith("http://localhost:16686/trace/abc123");

    expect(timelineMock).toHaveBeenCalledWith({
      deploymentId: "dep_demo",
      limit: 500,
    });
    expect(timelineStreamMock).toHaveBeenCalledWith({
      deploymentId: "dep_demo",
      limit: 0,
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

  test("[QUICK-DEPLOY-TIMELINE-001] confirms terminal replay with the follow stream", async () => {
    timelineMock.mockResolvedValue({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: "dep_demo",
      hasMore: false,
      entries: [
        {
          deploymentId: "dep_demo",
          sequence: 1,
          cursor: "dep_demo:1",
          occurredAt: "2026-01-01T00:00:01.000Z",
          source: "docker",
          kind: "output",
          phase: "deploy",
          level: "info",
          message: "latest: Pulling from muchobien/pocketbase",
        },
        {
          deploymentId: "dep_demo",
          sequence: 2,
          cursor: "dep_demo:2",
          occurredAt: "2026-01-01T00:00:02.000Z",
          source: "appaloft",
          kind: "status",
          phase: "verify",
          level: "info",
          message: "Deployment succeeded",
          status: "succeeded",
        },
      ],
    });
    timelineStreamMock.mockResolvedValue(
      (async function* () {
        yield {
          schemaVersion: "deployments.timeline/v1",
          kind: "closed",
          reason: "completed",
          cursor: "dep_demo:2",
        } satisfies DeploymentTimelineEnvelope;
      })(),
    );

    const progressEvents: DeploymentProgressEvent[] = [];
    await observeDeploymentProgressAfterAcceptance(
      "dep_demo",
      (event) => {
        progressEvents.push(event);
      },
      {},
    );

    expect(progressEvents.map((event) => event.message)).toEqual([
      "latest: Pulling from muchobien/pocketbase",
      "Deployment succeeded",
    ]);
    expect(timelineStreamMock).toHaveBeenCalledWith({
      deploymentId: "dep_demo",
      limit: 0,
      includeHistory: false,
      follow: true,
      untilTerminal: true,
      cursor: "dep_demo:2",
    });
  });

  test("[DEP-REDEPLOY-WEB-001] follows accepted redeploy timeline without injecting skipped phases", async () => {
    timelineMock.mockResolvedValue({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: "dep_redeploy",
      hasMore: false,
      entries: [
        {
          deploymentId: "dep_redeploy",
          sequence: 1,
          cursor: "dep_redeploy:1",
          occurredAt: "2026-01-01T00:00:01.000Z",
          source: "docker",
          kind: "output",
          phase: "deploy",
          level: "info",
          message: "Container image already present, recreating service",
        },
        {
          deploymentId: "dep_redeploy",
          sequence: 2,
          cursor: "dep_redeploy:2",
          occurredAt: "2026-01-01T00:00:02.000Z",
          source: "health",
          kind: "health-check",
          phase: "verify",
          level: "info",
          message: "Public route is reachable at https://demo.example.test",
          status: "succeeded",
        },
      ],
    });

    const progressEvents: DeploymentProgressEvent[] = [];
    await observeDeploymentProgressAfterAcceptance(
      "dep_redeploy",
      (event) => {
        progressEvents.push(event);
      },
      {},
    );

    expect(progressEvents.map((event) => event.phase)).toEqual(["deploy", "verify"]);
    expect(progressEvents.map((event) => event.message)).toEqual([
      "Container image already present, recreating service",
      "Public route is reachable at https://demo.example.test",
    ]);
    expect(timelineStreamMock).not.toHaveBeenCalled();
  });

  test("[QUICK-DEPLOY-TIMELINE-002] asks the follow stream for history when replay is initially empty", async () => {
    timelineMock.mockResolvedValue({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: "dep_demo",
      hasMore: false,
      entries: [],
    });
    timelineStreamMock.mockResolvedValue(
      (async function* () {
        yield {
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
            message: "latest: Pulling from muchobien/pocketbase",
          },
        } satisfies DeploymentTimelineEnvelope;
        yield {
          schemaVersion: "deployments.timeline/v1",
          kind: "closed",
          reason: "completed",
          cursor: "dep_demo:1",
        } satisfies DeploymentTimelineEnvelope;
      })(),
    );

    const progressEvents: DeploymentProgressEvent[] = [];
    await observeDeploymentProgressAfterAcceptance(
      "dep_demo",
      (event) => {
        progressEvents.push(event);
      },
      {},
    );

    expect(timelineStreamMock).toHaveBeenCalledWith({
      deploymentId: "dep_demo",
      limit: 500,
      includeHistory: true,
      follow: true,
      untilTerminal: true,
    });
    expect(progressEvents.map((event) => event.message)).toEqual([
      "latest: Pulling from muchobien/pocketbase",
    ]);
  });
});
