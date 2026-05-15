import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AuditEventRecorder,
  type AuditEventRecordInput,
  createExecutionContext,
  type IdGenerator,
  type RepositoryContext,
  type ServerRepository,
  type TerminalSessionOpenRequest,
} from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetUsername,
  HostAddress,
  PortNumber,
  ProviderKey,
  Server,
  SshPrivateKeyText,
  TargetKindValue,
  ok,
  type Result,
} from "@appaloft/core";

import { RuntimeTerminalSessionGateway } from "../src/terminal-sessions";

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server | null) {}

  async findOne(): Promise<Server | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

class SequenceIdGenerator implements IdGenerator {
  private nextValue = 1;

  next(prefix: string): string {
    return `${prefix}_${this.nextValue++}`;
  }
}

class CapturingAuditEventRecorder implements AuditEventRecorder {
  readonly records: AuditEventRecordInput[] = [];

  async record(
    _context: RepositoryContext,
    record: AuditEventRecordInput,
  ): Promise<Result<void>> {
    this.records.push(record);
    return ok(undefined);
  }
}

class MutableClock {
  constructor(private value: string) {}

  now(): string {
    return this.value;
  }

  set(value: string): void {
    this.value = value;
  }
}

function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

function controlledStream(): {
  stream: ReadableStream<Uint8Array>;
  write(data: string): void;
  close(): void;
} {
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    }),
    write(data: string) {
      streamController?.enqueue(new TextEncoder().encode(data));
    },
    close() {
      streamController?.close();
    },
  };
}

async function readFrames(
  session: AsyncIterable<{ kind: string; stream?: string; data?: string }>,
  count: number,
): Promise<Array<{ kind: string; stream?: string; data?: string }>> {
  const frames: Array<{ kind: string; stream?: string; data?: string }> = [];
  for await (const frame of session) {
    frames.push(frame);
    if (frames.length >= count) {
      break;
    }
  }
  return frames;
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

function resourceTerminalRequest(
  metadata: Record<string, string>,
  overrides: {
    providerKey?: string;
    serverId?: string;
    executionKind?: "dockerfile" | "docker-container" | "docker-compose-stack";
    composeFile?: string;
    targetServiceName?: string;
    services?: Array<{ name: string; kind: "web" | "worker" | "cron" }>;
  } = {},
): TerminalSessionOpenRequest {
  const providerKey = overrides.providerKey ?? "local-shell";
  const serverId = overrides.serverId ?? "srv_local";
  const executionKind = overrides.executionKind ?? "dockerfile";
  const services = overrides.services ?? [{ name: "web", kind: "web" as const }];
  return {
    sessionId: "term_runtime",
    initialRows: 24,
    initialCols: 80,
    scope: {
      kind: "resource",
      workingDirectory: "/host/runtime/dep_1/source",
      server: {
        id: serverId,
        providerKey,
      },
      resource: {
        id: "res_web",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Web",
        slug: "web",
        kind: "web",
        createdAt: "2026-05-14T00:00:00.000Z",
        services,
        ...(overrides.targetServiceName
          ? {
              networkProfile: {
                internalPort: 3000,
                upstreamProtocol: "http",
                exposureMode: "edge-proxy",
                targetServiceName: overrides.targetServiceName,
              },
            }
          : {}),
        deploymentCount: 1,
      },
      deployment: {
        id: "dep_1",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_web",
        serverId: "srv_local",
        destinationId: "dst_demo",
        status: "succeeded",
        runtimePlan: {
          id: "rtp_1",
          source: {
            kind: "local-folder",
            locator: "/repo/web",
            displayName: "web",
          },
          buildStrategy: "dockerfile",
          packagingMode: executionKind === "docker-compose-stack" ? "compose-bundle" : "dockerfile",
          execution: {
            kind: executionKind,
            workingDirectory: "/host/runtime/dep_1/source",
            ...(overrides.composeFile ? { composeFile: overrides.composeFile } : {}),
            metadata,
          },
          target: {
            kind: "single-server",
            providerKey,
            serverIds: [serverId],
          },
          detectSummary: "Dockerfile",
          generatedAt: "2026-05-14T00:00:00.000Z",
          steps: [],
        },
        environmentSnapshot: {
          id: "envsnap_1",
          environmentId: "env_demo",
          createdAt: "2026-05-14T00:00:00.000Z",
          precedence: [],
          variables: [],
        },
        logs: [],
        createdAt: "2026-05-14T00:00:00.000Z",
        serverId: "srv_local",
        destinationId: "dst_demo",
      },
    },
  } as TerminalSessionOpenRequest;
}

describe("RuntimeTerminalSessionGateway", () => {
  test("[TERM-SESSION-TRANSPORT-001] [TERM-SESSION-WORKSPACE-001] opens local container terminals through docker exec", async () => {
    const spawns: Array<{ args: string[]; cwd?: string }> = [];
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      spawnProcess(args, options) {
        spawns.push({ args, ...(options.cwd ? { cwd: options.cwd } : {}) });
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });

    const result = await gateway.open(
      createExecutionContext({ requestId: "req_terminal_runtime_test", entrypoint: "system" }),
      resourceTerminalRequest({
        containerName: "appaloft-dep_1",
        containerWorkdir: "/app",
      }),
    );

    expect(result.isOk()).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toEqual({
      args: [
        "docker",
        "exec",
        "-i",
        "-w",
        "/app",
        "appaloft-dep_1",
        "sh",
        "-lc",
        expect.stringContaining("exec ${SHELL:-/bin/sh} -i"),
      ],
    });
    expect(JSON.stringify(spawns[0])).not.toContain("/host/runtime/dep_1/source");
    await gateway.close("term_runtime");
  });

  test("[TERM-SESSION-TRANSPORT-003] forwards resize frames to subprocess PTY adapters when supported", async () => {
    const resizeCalls: Array<{ rows: number; cols: number }> = [];
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      spawnProcess() {
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
          resize(rows: number, cols: number) {
            resizeCalls.push({ rows, cols });
          },
        };
      },
    });

    const result = await gateway.open(
      createExecutionContext({ requestId: "req_terminal_resize_test", entrypoint: "system" }),
      resourceTerminalRequest({
        containerName: "appaloft-dep_1",
        containerWorkdir: "/app",
      }),
    );
    expect(result.isOk()).toBe(true);

    const attachResult = gateway.attach("term_runtime");
    expect(attachResult.isOk()).toBe(true);
    if (attachResult.isErr()) {
      throw attachResult.error;
    }

    await attachResult.value.resize({ rows: 40, cols: 120 });

    expect(resizeCalls).toEqual([{ rows: 40, cols: 120 }]);
    await gateway.close("term_runtime");
  });

  test("[TERM-SESSION-WORKSPACE-002] opens local compose service terminals through docker compose exec", async () => {
    const spawns: Array<{ args: string[]; cwd?: string }> = [];
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      spawnProcess(args, options) {
        spawns.push({ args, ...(options.cwd ? { cwd: options.cwd } : {}) });
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });

    const result = await gateway.open(
      createExecutionContext({ requestId: "req_terminal_compose_test", entrypoint: "system" }),
      resourceTerminalRequest(
        {
          composeFile: "/host/runtime/dep_1/source/compose.yml",
          composeProjectName: "appaloft-dep-1",
          containerWorkdir: "/srv/app",
        },
        {
          executionKind: "docker-compose-stack",
          targetServiceName: "api",
          services: [
            { name: "web", kind: "web" },
            { name: "api", kind: "web" },
          ],
        },
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toEqual({
      args: [
        "docker",
        "compose",
        "-p",
        "appaloft-dep-1",
        "-f",
        "/host/runtime/dep_1/source/compose.yml",
        "exec",
        "-T",
        "--workdir",
        "/srv/app",
        "api",
        "sh",
        "-lc",
        expect.stringContaining("exec ${SHELL:-/bin/sh} -i"),
      ],
    });
    await gateway.close("term_runtime");
  });

  test("[TERM-SESSION-TRANSPORT-001] opens generic SSH container terminals through docker exec", async () => {
    const spawns: Array<{ args: string[]; cwd?: string }> = [];
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      serverRepository: new StaticServerRepository(sshServer()),
      spawnProcess(args, options) {
        spawns.push({ args, ...(options.cwd ? { cwd: options.cwd } : {}) });
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });

    const result = await gateway.open(
      createExecutionContext({ requestId: "req_terminal_ssh_container_test", entrypoint: "system" }),
      resourceTerminalRequest(
        {
          containerName: "appaloft-api",
          containerWorkdir: "/app",
        },
        {
          providerKey: "generic-ssh",
          serverId: "srv_ssh",
          executionKind: "docker-container",
        },
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.args[0]).toBe("ssh");
    expect(spawns[0]?.args).toContain("deployer@203.0.113.10");
    expect(spawns[0]?.args.at(-1)).toContain("docker exec -it -w '/app' 'appaloft-api'");
    expect(spawns[0]?.args.at(-1)).not.toContain("secret");
    await gateway.close("term_runtime");
  });

  test("[TERM-SESSION-WORKSPACE-002] opens generic SSH compose service terminals through docker compose exec", async () => {
    const spawns: Array<{ args: string[]; cwd?: string }> = [];
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      serverRepository: new StaticServerRepository(sshServer()),
      spawnProcess(args, options) {
        spawns.push({ args, ...(options.cwd ? { cwd: options.cwd } : {}) });
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });

    const result = await gateway.open(
      createExecutionContext({ requestId: "req_terminal_ssh_compose_test", entrypoint: "system" }),
      resourceTerminalRequest(
        {
          composeFile: "/var/lib/appaloft/runtime/ssh-deployments/dep_1/source/compose.yml",
          composeProjectName: "appaloft-dep-1",
          containerWorkdir: "/srv/app",
        },
        {
          providerKey: "generic-ssh",
          serverId: "srv_ssh",
          executionKind: "docker-compose-stack",
          targetServiceName: "api",
          services: [
            { name: "web", kind: "web" },
            { name: "api", kind: "web" },
          ],
        },
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.args[0]).toBe("ssh");
    expect(spawns[0]?.args).toContain("deployer@203.0.113.10");
    expect(spawns[0]?.args.at(-1)).toContain(
      "docker compose -p 'appaloft-dep-1' -f '/var/lib/appaloft/runtime/ssh-deployments/dep_1/source/compose.yml' exec --workdir '/srv/app' 'api'",
    );
    expect(spawns[0]?.args.at(-1)).not.toContain("secret");
    await gateway.close("term_runtime");
  });

  test("[TERM-SESSION-LIFE-006] records durable safe audit metadata for terminal open and close", async () => {
    const auditEventRecorder = new CapturingAuditEventRecorder();
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      auditEventRecorder,
      clock: {
        now: () => "2026-05-14T12:00:00.000Z",
      },
      idGenerator: new SequenceIdGenerator(),
      spawnProcess() {
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });

    const context = createExecutionContext({
      requestId: "req_terminal_audit_test",
      entrypoint: "http",
      actor: {
        kind: "user",
        id: "usr_operator",
      },
    });
    const result = await gateway.open(
      context,
      resourceTerminalRequest({
        containerName: "appaloft-dep_1",
      }),
    );

    expect(result.isOk()).toBe(true);
    const closeResult = await gateway.close("term_runtime");

    expect(closeResult.isOk()).toBe(true);
    expect(auditEventRecorder.records).toEqual([
      {
        id: "aud_1",
        aggregateId: "res_web",
        eventType: "terminal-session-opened",
        createdAt: "2026-05-14T12:00:00.000Z",
        payload: {
          operationKey: "terminal-sessions.open",
          openedAt: "2026-05-14T12:00:00.000Z",
          sessionId: "term_runtime",
          scope: "resource",
          serverId: "srv_local",
          providerKey: "local-shell",
          entrypoint: "http",
          requestId: "req_terminal_audit_test",
          actorKind: "user",
          actorId: "usr_operator",
          resourceId: "res_web",
          deploymentId: "dep_1",
        },
      },
      {
        id: "aud_2",
        aggregateId: "res_web",
        eventType: "terminal-session-closed",
        createdAt: "2026-05-14T12:00:00.000Z",
        payload: {
          operationKey: "terminal-sessions.close",
          closedAt: "2026-05-14T12:00:00.000Z",
          closeReason: "cancelled",
          sessionId: "term_runtime",
          scope: "resource",
          serverId: "srv_local",
          providerKey: "local-shell",
          entrypoint: "http",
          requestId: "req_terminal_audit_test",
          actorKind: "user",
          actorId: "usr_operator",
          resourceId: "res_web",
          deploymentId: "dep_1",
        },
      },
    ]);
    expect(JSON.stringify(auditEventRecorder.records)).not.toContain("secret");
    expect(JSON.stringify(auditEventRecorder.records)).not.toContain("sh -lc");
  });

  test("[TERM-SESSION-LIFE-005] expires sessions idle past the gateway active-session TTL when no cutoff is supplied", async () => {
    const clock = new MutableClock("2026-05-14T12:00:00.000Z");
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      activeSessionTtlMs: 30 * 60 * 1000,
      clock,
      spawnProcess() {
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: closedStream(),
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });
    const context = createExecutionContext({
      requestId: "req_terminal_expire_policy_test",
      entrypoint: "system",
    });

    const staleResult = await gateway.open(context, {
      ...resourceTerminalRequest({
        containerName: "appaloft-dep_stale",
      }),
      sessionId: "term_stale",
    });
    clock.set("2026-05-14T12:05:00.000Z");
    const activeResult = await gateway.open(context, {
      ...resourceTerminalRequest({
        containerName: "appaloft-dep_active",
      }),
      sessionId: "term_active",
    });
    clock.set("2026-05-14T12:45:00.000Z");
    const recentResult = await gateway.open(context, {
      ...resourceTerminalRequest({
        containerName: "appaloft-dep_recent",
      }),
      sessionId: "term_recent",
    });
    clock.set("2026-05-14T12:50:00.000Z");
    const attachResult = gateway.attach("term_active");
    expect(attachResult.isOk()).toBe(true);
    if (attachResult.isOk()) {
      await attachResult.value.write("date\n");
    }
    clock.set("2026-05-14T13:00:00.000Z");

    expect(staleResult.isOk()).toBe(true);
    expect(activeResult.isOk()).toBe(true);
    expect(recentResult.isOk()).toBe(true);

    const expireResult = await gateway.expire();

    expect(expireResult.isOk()).toBe(true);
    expect(expireResult._unsafeUnwrap()).toEqual({
      expiredCount: 1,
      sessionIds: ["term_stale"],
    });
    expect(gateway.list().map((session) => session.sessionId)).toEqual([
      "term_recent",
      "term_active",
    ]);

    await gateway.close("term_active");
    await gateway.close("term_recent");
  });

  test("[TERM-SESSION-TRANSPORT-004] reattaches with bounded retained output without persisting terminal content", async () => {
    const stdout = controlledStream();
    const gateway = new RuntimeTerminalSessionGateway({
      allowTerminalSessions: true,
      outputRetentionBytes: 12,
      spawnProcess() {
        return {
          stdin: {
            write() {},
            flush() {},
            end() {},
          },
          stdout: stdout.stream,
          stderr: closedStream(),
          exited: new Promise<number>(() => {}),
          kill() {},
        };
      },
    });
    const context = createExecutionContext({
      requestId: "req_terminal_output_retention_test",
      entrypoint: "http",
    });

    const openResult = await gateway.open(
      context,
      resourceTerminalRequest({
        containerName: "appaloft-dep_1",
      }),
    );
    expect(openResult.isOk()).toBe(true);

    const firstAttach = gateway.attach("term_runtime");
    expect(firstAttach.isOk()).toBe(true);
    if (firstAttach.isErr()) {
      throw firstAttach.error;
    }
    await readFrames(firstAttach.value, 1);
    stdout.write("old-output\n");
    stdout.write("new-output\n");
    await readFrames(firstAttach.value, 2);

    const secondAttach = gateway.attach("term_runtime");
    expect(secondAttach.isOk()).toBe(true);
    if (secondAttach.isErr()) {
      throw secondAttach.error;
    }

    const replayedFrames = await readFrames(secondAttach.value, 1);
    expect(replayedFrames).toEqual([
      {
        kind: "output",
        stream: "stdout",
        data: "new-output\n",
      },
    ]);
    expect(gateway.show("term_runtime")._unsafeUnwrap().status).toBe("active");
    expect(JSON.stringify(gateway.list())).not.toContain("new-output");

    await gateway.close("term_runtime");
  });
});
