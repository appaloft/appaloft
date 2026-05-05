import { describe, expect, test } from "bun:test";
import type { ExecutionContext } from "@appaloft/application";
import { domainError, err, ok, type DomainError, type Result } from "@appaloft/core";
import {
  dockerComposeRuntimeControlCommand,
  dockerContainerRuntimeControlCommand,
  RuntimeResourceRuntimeControlTarget,
  type RuntimeControlCommandExecution,
  type RuntimeControlCommandExecutor,
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
});
