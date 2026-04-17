import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  type AppSpan,
  createExecutionContext,
  type ExecutionContext,
  type toRepositoryContext,
} from "../src";
import { ResourceRuntimeLogsQuery } from "../src/messages";
import {
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type ResourceReadModel,
  type ResourceRuntimeLogContext,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogReader,
  type ResourceRuntimeLogRequest,
  type ResourceRuntimeLogStream,
  type ResourceSummary,
} from "../src/ports";
import { ResourceRuntimeLogsQueryService } from "../src/use-cases";

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[]) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]> {
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }
}

class StaticRuntimeLogStream implements ResourceRuntimeLogStream {
  closed = false;

  constructor(private readonly events: ResourceRuntimeLogEvent[]) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ResourceRuntimeLogEvent> {
    for (const event of this.events) {
      if (this.closed) {
        return;
      }

      yield event;
    }
  }
}

class RecordingRuntimeLogReader implements ResourceRuntimeLogReader {
  calls: Array<{
    context: ResourceRuntimeLogContext;
    request: ResourceRuntimeLogRequest;
    signal: AbortSignal;
  }> = [];

  constructor(private readonly stream: ResourceRuntimeLogStream) {}

  async open(
    _context: ExecutionContext,
    logContext: ResourceRuntimeLogContext,
    request: ResourceRuntimeLogRequest,
    signal: AbortSignal,
  ): Promise<Result<ResourceRuntimeLogStream>> {
    this.calls.push({
      context: logContext,
      request,
      signal,
    });
    return ok(this.stream);
  }
}

interface RecordedSpan {
  attributes: Record<string, boolean | number | string | undefined>;
  errors: Array<Error | { message: string; name?: string; stack?: string }>;
  events: Array<{
    attributes?: Record<string, boolean | number | string | undefined>;
    name: string;
  }>;
  name: string;
  status?: {
    message?: string;
    status: "error" | "ok";
  };
}

class RecordingAppSpan implements AppSpan {
  constructor(private readonly recorded: RecordedSpan) {}

  addEvent(name: string, attributes?: Record<string, boolean | number | string | undefined>): void {
    this.recorded.events.push({
      name,
      ...(attributes ? { attributes } : {}),
    });
  }

  recordError(error: Error | { message: string; name?: string; stack?: string }): void {
    this.recorded.errors.push(error);
  }

  setAttribute(name: string, value: boolean | number | string): void {
    this.recorded.attributes[name] = value;
  }

  setAttributes(attributes: Record<string, boolean | number | string | undefined>): void {
    Object.assign(this.recorded.attributes, attributes);
  }

  setStatus(status: "error" | "ok", message?: string): void {
    this.recorded.status = {
      status,
      ...(message ? { message } : {}),
    };
  }
}

class RecordingAppTracer {
  readonly spans: RecordedSpan[] = [];

  async startActiveSpan<T>(
    name: string,
    options: {
      attributes?: Record<string, boolean | number | string | undefined>;
    },
    callback: (span: AppSpan) => Promise<T> | T,
  ): Promise<T> {
    const recorded: RecordedSpan = {
      attributes: { ...(options.attributes ?? {}) },
      errors: [],
      events: [],
      name,
    };
    this.spans.push(recorded);
    return callback(new RecordingAppSpan(recorded));
  }
}

function createTestContext(input?: { tracer?: RecordingAppTracer }): ExecutionContext {
  return createExecutionContext({
    requestId: "req_resource_runtime_logs_test",
    entrypoint: "system",
    ...(input?.tracer ? { tracer: input.tracer } : {}),
  });
}

function resourceSummary(overrides?: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    services: [
      {
        name: "web",
        kind: "web",
      },
    ],
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      targetServiceName: "web",
    },
    deploymentCount: 1,
    lastDeploymentId: "dep_web",
    lastDeploymentStatus: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "succeeded",
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
        metadata: {
          logPath: "/tmp/appaloft-runtime.log",
        },
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["start process"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [
        {
          key: "TOKEN",
          value: "secret-token",
          kind: "secret",
          exposure: "runtime",
          scope: "environment",
          isSecret: true,
        },
      ],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z",
    logCount: 0,
    ...overrides,
  };
}

function logLine(message: string): ResourceRuntimeLogEvent {
  return {
    kind: "line",
    line: {
      resourceId: "res_web",
      deploymentId: "dep_web",
      serviceName: "web",
      runtimeKind: "host-process",
      stream: "stdout",
      timestamp: "2026-01-01T00:00:03.000Z",
      sequence: 1,
      message,
      masked: false,
    },
  };
}

function createService(input?: {
  resources?: ResourceSummary[];
  deployments?: DeploymentSummary[];
  stream?: ResourceRuntimeLogStream;
}) {
  const reader = new RecordingRuntimeLogReader(
    input?.stream ??
      new StaticRuntimeLogStream([
        logLine("server started with TOKEN=secret-token"),
        {
          kind: "closed",
          reason: "source-ended",
        },
      ]),
  );
  const service = new ResourceRuntimeLogsQueryService(
    new StaticResourceReadModel(input?.resources ?? [resourceSummary()]),
    new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
    reader,
  );

  return {
    reader,
    service,
  };
}

describe("ResourceRuntimeLogsQueryService", () => {
  test("returns bounded runtime logs through the injected reader and masks secret values", async () => {
    const context = createTestContext();
    const { reader, service } = createService();
    const query = ResourceRuntimeLogsQuery.create({
      resourceId: "res_web",
      tailLines: 50,
      follow: false,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("bounded");
    expect(output.resourceId).toBe("res_web");
    expect(output.deploymentId).toBe("dep_web");
    expect(output.mode === "bounded" ? output.logs : []).toHaveLength(1);
    expect(output.mode === "bounded" ? output.logs[0]?.message : "").toContain("********");
    expect(output.mode === "bounded" ? output.logs[0]?.message : "").not.toContain("secret-token");
    expect(output.mode === "bounded" ? output.logs[0]?.masked : false).toBe(true);
    expect(reader.calls[0]?.request).toMatchObject({
      follow: false,
      serviceName: "web",
      tailLines: 50,
    });
  });

  test("records runtime log open and bounded collection spans", async () => {
    const tracer = new RecordingAppTracer();
    const context = createTestContext({ tracer });
    const { service } = createService();
    const query = ResourceRuntimeLogsQuery.create({
      resourceId: "res_web",
      tailLines: 50,
      follow: false,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(tracer.spans.map((span) => span.name)).toEqual([
      "appaloft.runtime_logs.open",
      "appaloft.runtime_logs.collect_bounded",
    ]);
    expect(tracer.spans[0]?.attributes).toMatchObject({
      "appaloft.resource.id": "res_web",
      "appaloft.deployment.id": "dep_web",
      "appaloft.runtime.kind": "host-process",
      "appaloft.runtime_logs.follow": false,
      "appaloft.runtime_logs.tail_lines": 50,
      "appaloft.runtime_logs.service_name": "web",
      "appaloft.target.provider_key": "local-shell",
    });
    expect(tracer.spans[0]?.status).toEqual({ status: "ok" });
    expect(tracer.spans[1]?.attributes).toMatchObject({
      "appaloft.runtime_logs.close_reason": "source-ended",
      "appaloft.runtime_logs.line_count": 1,
    });
    expect(tracer.spans[1]?.status).toEqual({ status: "ok" });
  });

  test("returns a stream result for follow requests", async () => {
    const context = createTestContext();
    const stream = new StaticRuntimeLogStream([logLine("ready")]);
    const { reader, service } = createService({ stream });
    const query = ResourceRuntimeLogsQuery.create({
      resourceId: "res_web",
      tailLines: 10,
      follow: true,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.mode).toBe("stream");
    expect(reader.calls[0]?.request.follow).toBe(true);

    if (output.mode === "stream") {
      const events: ResourceRuntimeLogEvent[] = [];
      for await (const event of output.stream) {
        events.push(event);
      }
      await output.stream.close();
      expect(events[0]).toMatchObject({
        kind: "line",
        line: {
          message: "ready",
        },
      });
    }
  });

  test("rejects an explicit deployment that belongs to another resource", async () => {
    const context = createTestContext();
    const { service } = createService({
      deployments: [
        deploymentSummary({
          id: "dep_other",
          resourceId: "res_other",
        }),
      ],
    });
    const query = ResourceRuntimeLogsQuery.create({
      resourceId: "res_web",
      deploymentId: "dep_other",
      tailLines: 10,
      follow: false,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("resource_runtime_logs_context_mismatch");
  });

  test("reports runtime logs unavailable when the resource has no deployments", async () => {
    const context = createTestContext();
    const { service } = createService({
      deployments: [],
    });
    const query = ResourceRuntimeLogsQuery.create({
      resourceId: "res_web",
      tailLines: 10,
      follow: false,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("resource_runtime_logs_unavailable");
  });
});
