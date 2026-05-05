import { describe, expect, test } from "bun:test";
import type { ExecutionContext, ServerRepository } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetUsername,
  domainError,
  err,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  Server,
  SshPrivateKeyText,
  TargetKindValue,
  type DomainError,
  type Result,
} from "@appaloft/core";
import {
  dockerComposeRuntimeControlCommand,
  dockerContainerRuntimeControlCommand,
  RuntimeControlShellCommandExecutor,
  RuntimeResourceRuntimeControlTarget,
  type RuntimeControlCommandExecution,
  type RuntimeControlCommandExecutor,
  type RuntimeControlSpawn,
} from "../src/resource-runtime-control-target";

function quote(input: string): string {
  return `'${input}'`;
}

class RecordingRuntimeControlExecutor implements RuntimeControlCommandExecutor {
  readonly executions: RuntimeControlCommandExecution[] = [];

  constructor(private readonly result: Result<void, DomainError> = ok(undefined)) {}

  async run(
    _context: ExecutionContext,
    execution: RuntimeControlCommandExecution,
  ): Promise<Result<void, DomainError>> {
    this.executions.push(execution);
    return this.result;
  }
}

type SpawnCall = {
  args: readonly string[];
  cwd?: string;
  timeout: number;
};

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server | null) {}

  async findOne(): Promise<Server | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

function createSpawn(calls: SpawnCall[], status = 0): RuntimeControlSpawn {
  return (args, options) => {
    calls.push({
      args,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      timeout: options.timeout,
    });

    return {
      status,
      stdout: "",
      stderr: "",
    };
  };
}

function context(): ExecutionContext {
  return {
    entrypoint: "system",
    requestId: "req_runtime_control_target_test",
    locale: "en",
    t: (key) => key,
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
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

describe("RuntimeResourceRuntimeControlTarget", () => {
  test("[RUNTIME-CTRL-ADAPTER-001] maps Docker container stop/start/restart to scoped container commands", async () => {
    expect(
      dockerContainerRuntimeControlCommand({
        operation: "stop",
        containerName: "web-dep_1",
        quote,
      }),
    ).toBe("docker stop 'web-dep_1'");

    const executor = new RecordingRuntimeControlExecutor();
    const target = new RuntimeResourceRuntimeControlTarget(executor, quote);
    const result = await target.control(context(), {
      runtimeControlAttemptId: "rtc_adapter_1",
      operation: "restart",
      resourceId: "res_web",
      deploymentId: "dep_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      runtimeKind: "docker-container",
      targetKind: "single-server",
      providerKey: "local-shell",
      runtimeMetadata: {
        containerName: "retained-web",
      },
      workingDirectory: "/srv/appaloft/runtime/dep_web",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "succeeded",
      runtimeState: "running",
      phases: [
        {
          phase: "stop",
          status: "succeeded",
        },
        {
          phase: "start",
          status: "succeeded",
        },
      ],
    });
    expect(executor.executions).toEqual([
      {
        command: "docker restart 'retained-web'",
        workingDirectory: "/srv/appaloft/runtime/dep_web",
        operation: "restart",
        providerKey: "local-shell",
        serverId: "srv_demo",
      },
    ]);
    expect(JSON.stringify(executor.executions)).not.toContain("container-id");
  });

  test("[RUNTIME-CTRL-ADAPTER-002] scopes Compose runtime control by project, file, and service", async () => {
    expect(
      dockerComposeRuntimeControlCommand({
        operation: "start",
        composeFile: "/srv/web/docker-compose.yml",
        projectName: "web-dep_web",
        serviceName: "api",
        quote,
      }),
    ).toBe("docker compose -p 'web-dep_web' -f '/srv/web/docker-compose.yml' start 'api'");

    const executor = new RecordingRuntimeControlExecutor();
    const target = new RuntimeResourceRuntimeControlTarget(executor, quote);
    const result = await target.control(context(), {
      runtimeControlAttemptId: "rtc_adapter_2",
      operation: "stop",
      resourceId: "res_web",
      deploymentId: "dep_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      runtimeKind: "docker-compose-stack",
      targetKind: "single-server",
      providerKey: "generic-ssh",
      runtimeMetadata: {
        composeFile: "/srv/web/docker-compose.yml",
        composeProjectName: "web-dep_web",
      },
      targetServiceName: "api",
      workingDirectory: "/srv/web",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "succeeded",
      runtimeState: "stopped",
    });
    expect(executor.executions).toEqual([
      {
        command: "docker compose -p 'web-dep_web' -f '/srv/web/docker-compose.yml' stop 'api'",
        workingDirectory: "/srv/web",
        operation: "stop",
        providerKey: "generic-ssh",
        serverId: "srv_demo",
      },
    ]);
  });

  test("[RUNTIME-CTRL-ADAPTER-002] blocks Compose control when retained compose metadata is missing", async () => {
    const executor = new RecordingRuntimeControlExecutor();
    const target = new RuntimeResourceRuntimeControlTarget(executor, quote);

    const result = await target.control(context(), {
      runtimeControlAttemptId: "rtc_adapter_3",
      operation: "start",
      resourceId: "res_web",
      deploymentId: "dep_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      runtimeKind: "docker-compose-stack",
      targetKind: "single-server",
      providerKey: "generic-ssh",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "blocked",
      runtimeState: "unknown",
      blockedReason: "runtime-metadata-stale",
      errorCode: "resource_runtime_metadata_missing",
    });
    expect(executor.executions).toHaveLength(0);
  });

  test("[RUNTIME-CTRL-ADAPTER-001] returns provider failure when command execution fails", async () => {
    const executor = new RecordingRuntimeControlExecutor(
      err(domainError.provider("Docker command failed", { safeAdapterErrorCode: "docker_failed" })),
    );
    const target = new RuntimeResourceRuntimeControlTarget(executor, quote);

    const result = await target.control(context(), {
      runtimeControlAttemptId: "rtc_adapter_4",
      operation: "stop",
      resourceId: "res_web",
      deploymentId: "dep_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      runtimeKind: "docker-container",
      targetKind: "single-server",
      providerKey: "local-shell",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      details: {
        phase: "runtime-control-execution",
        safeAdapterErrorCode: "docker_failed",
      },
    });
  });

  test("[RUNTIME-CTRL-ADAPTER-001] executes local-shell runtime control through bounded shell command", async () => {
    const calls: SpawnCall[] = [];
    const executor = new RuntimeControlShellCommandExecutor({
      spawn: createSpawn(calls),
      timeoutMs: 12_000,
    });

    const result = await executor.run(context(), {
      command: "docker stop 'retained-web'",
      workingDirectory: "/srv/appaloft/runtime/dep_web",
      operation: "stop",
      providerKey: "local-shell",
      serverId: "srv_local",
    });

    expect(result.isOk()).toBe(true);
    expect(calls).toEqual([
      {
        args: ["sh", "-lc", "docker stop 'retained-web'"],
        cwd: "/srv/appaloft/runtime/dep_web",
        timeout: 12_000,
      },
    ]);
  });

  test("[RUNTIME-CTRL-ADAPTER-002] executes generic-ssh runtime control with remote working directory", async () => {
    const calls: SpawnCall[] = [];
    const executor = new RuntimeControlShellCommandExecutor({
      serverRepository: new StaticServerRepository(sshServer()),
      spawn: createSpawn(calls),
      timeoutMs: 12_000,
    });

    const result = await executor.run(context(), {
      command: "docker compose -p 'web-dep_web' -f '/srv/web/docker-compose.yml' restart 'api'",
      workingDirectory: "/srv/web",
      operation: "restart",
      providerKey: "generic-ssh",
      serverId: "srv_ssh",
    });

    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.args[0]).toBe("ssh");
    expect(call?.args).toContain("deployer@203.0.113.10");
    expect(call?.args).toContain("2222");
    expect(call?.args).toContain("-i");
    expect(call?.args.at(-1)).toBe(
      "cd '/srv/web' && docker compose -p 'web-dep_web' -f '/srv/web/docker-compose.yml' restart 'api'",
    );
    expect(call?.timeout).toBe(12_000);
  });

  test("[RUNTIME-CTRL-ADAPTER-001] returns sanitized execution failure from command executor", async () => {
    const executor = new RuntimeControlShellCommandExecutor({
      spawn: createSpawn([], 1),
    });

    const result = await executor.run(context(), {
      command: "docker stop 'retained-web'",
      operation: "stop",
      providerKey: "local-shell",
      serverId: "srv_local",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      details: {
        phase: "runtime-control-execution",
        providerKey: "local-shell",
        operation: "stop",
        safeAdapterErrorCode: "runtime_control_command_failed",
        exitCode: 1,
      },
    });
  });
});
