import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { createExecutionContext, type ServerRepository } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetUsername,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  Server,
  SshPrivateKeyText,
  TargetKindValue,
} from "@appaloft/core";
import { RuntimeResourceHealthProbeRunner } from "../src/resource-health-probes";

function snapshotSshArgs(args: readonly string[]): string[] {
  const snapshot = [...args];
  const identityIndex = snapshot.indexOf("-i");
  if (identityIndex >= 0 && snapshot[identityIndex + 1]) {
    snapshot[identityIndex + 1] = "<identity-file>";
  }
  return snapshot;
}

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server | null) {}

  async findOne(): Promise<Server | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
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

function probeRequest(input: { targetServerId?: string } = {}) {
  return {
    resourceId: "res_web",
    deploymentId: "dep_web",
    ...(input.targetServerId ? { targetServerId: input.targetServerId } : {}),
    runtimeKind: "docker-container" as const,
    targetKind: "orchestrator-cluster" as const,
    providerKey: "docker-swarm",
    runtimeMetadata: {
      "swarm.serviceName": "appaloft-res-web-dst-demo-dep-web_web",
    },
    timeoutSeconds: 5,
  };
}

function containerProbeRequest(input: { targetServerId?: string } = {}) {
  return {
    resourceId: "res_web",
    deploymentId: "dep_web",
    ...(input.targetServerId ? { targetServerId: input.targetServerId } : {}),
    runtimeKind: "docker-container" as const,
    targetKind: "single-server" as const,
    providerKey: "generic-ssh",
    runtimeMetadata: {
      containerName: "appaloft-dep_web",
    },
    timeoutSeconds: 5,
  };
}

describe("RuntimeResourceHealthProbeRunner", () => {
  const context = createExecutionContext({
    requestId: "req_swarm_health",
    entrypoint: "system",
  });

  test("[SWARM-TARGET-OBS-002] normalizes healthy Docker Swarm service tasks", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(async (input) => {
      expect(input.args).toEqual([
        "docker",
        "service",
        "ps",
        "--no-trunc",
        "--format",
        "{{json .}}",
        "appaloft-res-web-dst-demo-dep-web_web",
      ]);
      return ok({
        exitCode: 0,
        stdout: JSON.stringify({
          Name: "appaloft-res-web-dst-demo-dep-web_web.1",
          DesiredState: "Running",
          CurrentState: "Running 12 seconds ago",
          Error: "",
        }),
      });
    });

    const result = await runner.probeRuntime(context, probeRequest());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      lifecycle: "running",
      health: "healthy",
      reasonCode: "docker_swarm_service_running",
      check: {
        name: "runtime-service",
        target: "container",
        status: "passed",
        reasonCode: "docker_swarm_service_running",
        phase: "runtime-live-probe",
        metadata: {
          providerKey: "docker-swarm",
          runtimeKind: "docker-container",
          serviceName: "appaloft-res-web-dst-demo-dep-web_web",
          taskCount: "1",
          runningTasks: "1",
          failedTasks: "0",
        },
      },
    });
  });

  test("[SWARM-TARGET-OBS-002] probes Docker Swarm service health through the Swarm manager over SSH", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(
      async (input) => {
        expect(snapshotSshArgs(input.args)).toMatchSnapshot();
        expect(input.args[0]).toBe("ssh");
        expect(input.args).toContain("2222");
        expect(input.args).toContain("IdentitiesOnly=yes");
        expect(input.args).toContain("deployer@203.0.113.10");
        expect(input.args.at(-1)).toBe(
          "docker service ps --no-trunc --format '{{json .}}' 'appaloft-res-web-dst-demo-dep-web_web'",
        );
        return ok({
          exitCode: 0,
          stdout: JSON.stringify({
            Name: "appaloft-res-web-dst-demo-dep-web_web.1",
            DesiredState: "Running",
            CurrentState: "Running 12 seconds ago",
            Error: "",
          }),
        });
      },
      new StaticServerRepository(sshServer()),
    );

    const result = await runner.probeRuntime(context, probeRequest({ targetServerId: "srv_ssh" }));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      lifecycle: "running",
      health: "healthy",
      reasonCode: "docker_swarm_service_running",
    });
  });

  test("[SWARM-TARGET-OBS-002] reports failed Docker Swarm service tasks without raw payloads", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(async () =>
      ok({
        exitCode: 0,
        stdout: JSON.stringify({
          Name: "appaloft-res-web-dst-demo-dep-web_web.1",
          DesiredState: "Running",
          CurrentState: "Rejected 2 seconds ago",
          Error: "No such image: registry.example.test/private/web:latest",
        }),
      }),
    );

    const result = await runner.probeRuntime(context, probeRequest());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary).toMatchObject({
      lifecycle: "degraded",
      health: "unhealthy",
      reasonCode: "docker_swarm_service_task_failed",
      check: {
        status: "failed",
        target: "container",
        reasonCode: "docker_swarm_service_task_failed",
        retriable: true,
      },
    });
    expect(JSON.stringify(summary)).not.toContain("No such image");
    expect(JSON.stringify(summary)).not.toContain("DesiredState");
    expect(JSON.stringify(summary)).not.toContain("CurrentState");
  });

  test("[RES-HEALTH-QRY-010] probes Docker container state on an SSH target", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(
      async (input) => {
        expect(snapshotSshArgs(input.args)).toMatchSnapshot();
        expect(input.args[0]).toBe("ssh");
        expect(input.args).toContain("2222");
        expect(input.args).toContain("IdentitiesOnly=yes");
        expect(input.args).toContain("deployer@203.0.113.10");
        expect(input.args.at(-1)).toBe(
          "docker inspect --format '{{json .State}}' 'appaloft-dep_web'",
        );
        return ok({
          exitCode: 0,
          stdout: JSON.stringify({
            Status: "running",
            Running: true,
            ExitCode: 0,
            Error: "",
            Health: {
              Status: "healthy",
            },
          }),
        });
      },
      new StaticServerRepository(sshServer()),
    );

    const result = await runner.probeRuntime(
      context,
      containerProbeRequest({ targetServerId: "srv_ssh" }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      lifecycle: "running",
      health: "healthy",
      reasonCode: "docker_container_running",
      check: {
        name: "runtime-service",
        target: "container",
        status: "passed",
        reasonCode: "docker_container_running",
        phase: "runtime-live-probe",
        metadata: {
          providerKey: "generic-ssh",
          runtimeKind: "docker-container",
          containerName: "appaloft-dep_web",
          containerStatus: "running",
          containerHealth: "healthy",
          exitCode: "0",
        },
      },
    });
  });

  test("[RES-HEALTH-QRY-010] reports unhealthy Docker container state without raw inspect payloads", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(async () =>
      ok({
        exitCode: 0,
        stdout: JSON.stringify({
          Status: "exited",
          Running: false,
          ExitCode: 137,
          Error: "application secret leaked here",
          OOMKilled: true,
        }),
      }),
    );

    const result = await runner.probeRuntime(context, containerProbeRequest());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary).toMatchObject({
      lifecycle: "exited",
      health: "unhealthy",
      reasonCode: "docker_container_not_running",
      check: {
        status: "failed",
        target: "container",
        reasonCode: "docker_container_not_running",
        retriable: true,
        metadata: {
          providerKey: "generic-ssh",
          runtimeKind: "docker-container",
          containerName: "appaloft-dep_web",
          containerStatus: "exited",
          exitCode: "137",
        },
      },
    });
    expect(JSON.stringify(summary)).not.toContain("application secret");
    expect(JSON.stringify(summary)).not.toContain("OOMKilled");
  });

  test("[RES-HEALTH-QRY-010] does not fall back to local Docker when SSH target resolution is unavailable", async () => {
    let commandCalled = false;
    const runner = new RuntimeResourceHealthProbeRunner(async () => {
      commandCalled = true;
      return ok({ exitCode: 0, stdout: "{}" });
    });

    const result = await runner.probeRuntime(
      context,
      containerProbeRequest({ targetServerId: "srv_missing" }),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_health_unavailable",
      details: {
        phase: "runtime-live-probe",
        step: "ssh-target-repository",
        targetServerId: "srv_missing",
      },
    });
    expect(commandCalled).toBe(false);
  });
});
