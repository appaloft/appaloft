import { describe, expect, test } from "bun:test";
import type {
  AppSpan,
  ExecutionContext,
  ResourceRuntimeLogContext,
  ResourceRuntimeLogEvent,
  ResourceRuntimeLogRequest,
  ResourceRuntimeLogStream,
  ResourceSummary,
  ServerRepository,
  DeploymentSummary,
} from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
  Server,
  SshPrivateKeyText,
  TargetKindValue,
  DeploymentTargetUsername,
} from "@appaloft/core";

type SpawnCall = {
  args: string[];
  cwd?: string;
};

interface RecordedSpan {
  attributes: Record<string, boolean | number | string | undefined>;
  errors: Array<Error | { message: string; name?: string; stack?: string }>;
  name: string;
  status?: {
    message?: string;
    status: "error" | "ok";
  };
}

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server | null) {}

  async findOne(): Promise<Server | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??=
    () =>
    () => {};
}

async function createReader(
  serverRepository: ServerRepository | undefined,
  spawnProcess: ReturnType<typeof createSpawn>,
  options?: {
    boundedProcessTimeoutMs?: number;
  },
) {
  ensureReflectMetadata();
  const { RuntimeResourceRuntimeLogReader } = await import("../src");
  return new RuntimeResourceRuntimeLogReader(serverRepository, spawnProcess, options);
}

class RecordingAppSpan implements AppSpan {
  constructor(private readonly recorded: RecordedSpan) {}

  addEvent(): void {}

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
      name,
    };
    this.spans.push(recorded);
    return callback(new RecordingAppSpan(recorded));
  }
}

function createTestExecutionContext(input?: { tracer?: RecordingAppTracer }): ExecutionContext {
  return {
    entrypoint: "system",
    requestId: "req_runtime_logs_test",
    tracer: input?.tracer ?? new RecordingAppTracer(),
  };
}

function createTextStream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

function createSpawn(calls: SpawnCall[], stdoutLines: string[] = ["ready\n"]) {
  return (
    args: string[],
    options: {
      cwd?: string;
      stdout: "pipe";
      stderr: "pipe";
    },
  ) => {
    calls.push({
      args,
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });

    return {
      stdout: createTextStream(stdoutLines),
      stderr: createTextStream([]),
      exited: Promise.resolve(0),
      kill() {},
    };
  };
}

function createHangingSpawn(input: { calls: SpawnCall[]; killed: { value: boolean } }) {
  return (
    args: string[],
    options: {
      cwd?: string;
      stdout: "pipe";
      stderr: "pipe";
    },
  ) => {
    input.calls.push({
      args,
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });

    return {
      stdout: new ReadableStream<Uint8Array>(),
      stderr: new ReadableStream<Uint8Array>(),
      exited: new Promise<number>(() => {}),
      kill() {
        input.killed.value = true;
      },
    };
  };
}

async function collectEvents(stream: ResourceRuntimeLogStream): Promise<ResourceRuntimeLogEvent[]> {
  const events: ResourceRuntimeLogEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function resourceSummary(): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    services: [],
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
    deploymentCount: 1,
    lastDeploymentId: "dep_web",
    lastDeploymentStatus: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function deploymentSummary(input?: {
  providerKey?: string;
  targetMetadata?: Record<string, string>;
  executionKind?: "docker-container" | "docker-compose-stack";
}): DeploymentSummary {
  const executionKind = input?.executionKind ?? "docker-container";
  return {
    id: "dep_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_ssh",
    destinationId: "dst_demo",
    status: "succeeded",
    runtimePlan: {
      id: "plan_demo",
      source: {
        kind: "git-public",
        locator: "https://example.test/repo.git",
        displayName: "repo",
      },
      buildStrategy: executionKind === "docker-compose-stack" ? "compose-deploy" : "dockerfile",
      packagingMode:
        executionKind === "docker-compose-stack" ? "docker-compose-stack" : "all-in-one-docker",
      execution: {
        kind: executionKind,
        port: 3000,
        ...(executionKind === "docker-compose-stack"
          ? {
              composeFile: "compose.yml",
              workingDirectory: "/srv/app",
              metadata: {
                composeFile: "/srv/app/compose.yml",
                workdir: "/srv/app",
              },
            }
          : {
              metadata: {
                containerName: "appaloft-dep_web",
              },
            }),
      },
      target: {
        kind: "single-server",
        providerKey: input?.providerKey ?? "local-shell",
        serverIds: ["srv_ssh"],
        metadata: input?.targetMetadata ?? {},
      },
      detectSummary: "detected",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["deploy"],
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
    logCount: 0,
  };
}

function logContext(input?: {
  providerKey?: string;
  targetMetadata?: Record<string, string>;
  executionKind?: "docker-container" | "docker-compose-stack";
}): ResourceRuntimeLogContext {
  return {
    resource: resourceSummary(),
    deployment: deploymentSummary(input),
    redactions: [],
  };
}

function request(input?: Partial<ResourceRuntimeLogRequest>): ResourceRuntimeLogRequest {
  return {
    tailLines: 25,
    follow: false,
    ...input,
  };
}

function sshServer(): Server {
  return Server.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_ssh"),
    name: DeploymentTargetName.rehydrate("SSH server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(2222),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    credential: {
      kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
      username: DeploymentTargetUsername.rehydrate("deployer"),
      privateKey: SshPrivateKeyText.rehydrate("-----BEGIN TEST KEY-----\nsecret\n-----END TEST KEY-----"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("RuntimeResourceRuntimeLogReader", () => {
  test("waits for process output before closing bounded local Docker logs", async () => {
    const calls: SpawnCall[] = [];
    const tracer = new RecordingAppTracer();
    const reader = await createReader(undefined, createSpawn(calls, ["ready\n"]));
    const result = await reader.open(
      createTestExecutionContext({ tracer }),
      logContext(),
      request(),
      new AbortController().signal,
    );

    expect(result.isOk()).toBe(true);
    const events = await collectEvents(result._unsafeUnwrap());

    expect(calls[0]?.args).toEqual([
      "docker",
      "logs",
      "--tail",
      "25",
      "appaloft-dep_web",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "line",
        line: expect.objectContaining({
          message: "ready",
        }),
      }),
    );
    expect(events.at(-1)).toEqual({
      kind: "closed",
      reason: "source-ended",
    });
    expect(tracer.spans).toHaveLength(1);
    expect(tracer.spans[0]?.name).toBe("appaloft.runtime_logs.process");
    expect(tracer.spans[0]?.attributes).toMatchObject({
      "appaloft.resource.id": "res_web",
      "appaloft.deployment.id": "dep_web",
      "appaloft.runtime.kind": "docker-container",
      "appaloft.runtime_logs.command": "docker_logs",
      "appaloft.runtime_logs.follow": false,
      "appaloft.runtime_logs.line_count": 1,
      "appaloft.runtime_logs.tail_lines": 25,
      "appaloft.target.provider_key": "local-shell",
    });
    expect(tracer.spans[0]?.status).toEqual({ status: "ok" });
  });

  test("opens generic SSH Docker container logs on the remote target", async () => {
    const calls: SpawnCall[] = [];
    const reader = await createReader(
      new StaticServerRepository(sshServer()),
      createSpawn(calls),
    );
    const result = await reader.open(
      createTestExecutionContext(),
      logContext({ providerKey: "generic-ssh" }),
      request({ follow: true }),
      new AbortController().signal,
    );

    expect(result.isOk()).toBe(true);
    await collectEvents(result._unsafeUnwrap());

    expect(calls[0]?.args[0]).toBe("ssh");
    expect(calls[0]?.args).toContain("2222");
    expect(calls[0]?.args).toContain("IdentitiesOnly=yes");
    expect(calls[0]?.args).toContain("deployer@203.0.113.10");
    expect(calls[0]?.args).toContain("ControlMaster=auto");
    expect(calls[0]?.args.at(-1)).toBe(
      "docker logs --tail '25' --follow 'appaloft-dep_web'",
    );
  });

  test("opens generic SSH Compose logs from the remote workdir", async () => {
    const calls: SpawnCall[] = [];
    const reader = await createReader(
      new StaticServerRepository(sshServer()),
      createSpawn(calls),
    );
    const result = await reader.open(
      createTestExecutionContext(),
      logContext({
        providerKey: "generic-ssh",
        executionKind: "docker-compose-stack",
      }),
      request({ serviceName: "web" }),
      new AbortController().signal,
    );

    expect(result.isOk()).toBe(true);
    await collectEvents(result._unsafeUnwrap());

    expect(calls[0]?.args[0]).toBe("ssh");
    expect(calls[0]?.args).not.toContain("--follow");
    expect(calls[0]?.args).not.toContain("ControlMaster=auto");
    expect(calls[0]?.args.some((arg) => arg.startsWith("ControlPath="))).toBe(false);
    expect(calls[0]?.args.at(-1)).toBe(
      "cd '/srv/app' && docker compose -f '/srv/app/compose.yml' logs --no-color --tail '25' 'web'",
    );
  });

  test("times out bounded process logs and kills the backend process", async () => {
    const calls: SpawnCall[] = [];
    const killed = { value: false };
    const tracer = new RecordingAppTracer();
    const reader = await createReader(undefined, createHangingSpawn({ calls, killed }), {
      boundedProcessTimeoutMs: 1,
    });
    const result = await reader.open(
      createTestExecutionContext({ tracer }),
      logContext(),
      request(),
      new AbortController().signal,
    );

    expect(result.isOk()).toBe(true);
    const events = await collectEvents(result._unsafeUnwrap());
    const error = events.at(-1);

    expect(calls[0]?.args).toEqual([
      "docker",
      "logs",
      "--tail",
      "25",
      "appaloft-dep_web",
    ]);
    expect(killed.value).toBe(true);
    expect(error).toEqual({
      kind: "error",
      error: expect.objectContaining({
        code: "timeout",
        category: "timeout",
        retryable: true,
        details: expect.objectContaining({
          adapter: "docker_logs",
          phase: "runtime-log-stream",
          step: "process-timeout",
          timeoutMs: 1,
        }),
      }),
    });
    expect(tracer.spans[0]?.status).toEqual({
      status: "error",
      message: "Runtime log process timed out after 1ms",
    });
    expect(tracer.spans[0]?.attributes).toMatchObject({
      "appaloft.runtime_logs.close_reason": "timeout",
      "appaloft.runtime_logs.timeout_ms": 1,
    });
  });
});
