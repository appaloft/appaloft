import "../../../application/node_modules/reflect-metadata/Reflect.js";
import { describe, expect, test } from "bun:test";
import {
  type AppSpan,
  type DeploymentReadModel,
  type DeploymentSummary,
  type ExecutionContext,
  type ServerRepository,
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
} from "@appaloft/core";
import {
  HermeticScheduledTaskRuntimePort,
  renderDockerComposeScheduledTaskCommand,
  renderDockerContainerScheduledTaskCommand,
  renderDockerSwarmScheduledTaskCommand,
  RuntimeTargetScheduledTaskRuntimePort,
  type ScheduledTaskCommandRunner,
  type ScheduledTaskProcessRunnerInput,
} from "../src/scheduled-task-runtime";

class StaticScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  constructor(private readonly result: Awaited<ReturnType<ScheduledTaskCommandRunner["run"]>>) {}

  async run(): ReturnType<ScheduledTaskCommandRunner["run"]> {
    return this.result;
  }
}

class ThrowingScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  async run(): ReturnType<ScheduledTaskCommandRunner["run"]> {
    throw new Error("failed with postgres://app:secret@db.internal/app");
  }
}

class CapturingScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  input: Parameters<ScheduledTaskCommandRunner["run"]>[0] | undefined;

  async run(input: Parameters<ScheduledTaskCommandRunner["run"]>[0]) {
    this.input = input;
    return {
      exitCode: 0,
      stdout: "captured",
    };
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployment: DeploymentSummary | null) {}

  async list(): Promise<DeploymentSummary[]> {
    return this.deployment ? [this.deployment] : [];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return this.deployment;
  }

  async findLogs(): Promise<[]> {
    return [];
  }
}

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server | null) {}

  async findOne(): Promise<Server | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

class NoopAppSpan implements AppSpan {
  addEvent(): void {}
  recordError(): void {}
  setAttribute(): void {}
  setAttributes(): void {}
  setStatus(): void {}
}

function context(): ExecutionContext {
  return {
    locale: "en",
    requestId: "req_scheduled_task_runtime_test",
    entrypoint: "system",
    t: (key) => key,
    tracer: {
      async startActiveSpan(_name, _options, callback) {
        return callback(new NoopAppSpan());
      },
    },
  };
}

function deploymentSummary(
  overrides: {
    providerKey?: string;
    serverId?: string;
    executionKind?: "docker-container" | "docker-compose-stack";
    targetKind?: "single-server" | "orchestrator-cluster";
    metadata?: Record<string, string>;
    composeFile?: string;
    runtimeArtifactComposeFile?: string;
  } = {},
): DeploymentSummary {
  const providerKey = overrides.providerKey ?? "generic-ssh";
  const serverId = overrides.serverId ?? "srv_ssh";
  const executionKind = overrides.executionKind ?? "docker-container";
  const metadata = overrides.metadata ?? {
    containerName: "appaloft-api",
  };

  return {
    id: "dep_live",
    projectId: "prj_demo",
    environmentId: "env_prod",
    resourceId: "res_api",
    serverId,
    destinationId: "dst_prod",
    status: "succeeded",
    runtimePlan: {
      id: "rtp_live",
      source: {
        kind: "remote-git",
        locator: "https://example.com/app.git",
        displayName: "api",
      },
      buildStrategy: "dockerfile",
      packagingMode: executionKind === "docker-compose-stack" ? "compose-bundle" : "all-in-one-docker",
      runtimeArtifact: {
        kind: executionKind === "docker-compose-stack" ? "compose-project" : "image",
        intent: executionKind === "docker-compose-stack" ? "compose-project" : "build-image",
        ...(executionKind === "docker-compose-stack"
          ? { composeFile: overrides.runtimeArtifactComposeFile ?? "/srv/app/compose.yml" }
          : { image: "registry.example.com/app:dep_live" }),
      },
      execution: {
        kind: executionKind,
        ...(executionKind === "docker-compose-stack"
          ? { composeFile: overrides.composeFile ?? "/srv/app/compose.yml" }
          : { image: "registry.example.com/app:dep_live" }),
        metadata,
      },
      target: {
        kind: overrides.targetKind ?? "single-server",
        providerKey,
        serverIds: [serverId],
      },
      detectSummary: "detected dockerfile",
      generatedAt: "2026-05-05T00:00:00.000Z",
      steps: [],
    },
    environmentSnapshot: {
      id: "envsnap_live",
      environmentId: "env_prod",
      createdAt: "2026-05-05T00:00:00.000Z",
      precedence: [],
      variables: [],
    },
    timeline: [],
    createdAt: "2026-05-05T00:00:00.000Z",
    logCount: 0,
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

describe("HermeticScheduledTaskRuntimePort", () => {
  test("[SCHED-TASK-RUNTIME-001] executes one-off task commands and returns run-scoped logs", async () => {
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner: new StaticScheduledTaskCommandRunner({
        exitCode: 0,
        stdout: "migration started\nmigration finished",
      }),
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "succeeded",
      exitCode: 0,
      startedAt: "2026-05-05T00:30:00.000Z",
      finishedAt: "2026-05-05T00:30:00.000Z",
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "migration started",
        },
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "migration finished",
        },
      ],
    });
  });

  test("[SCHED-TASK-SECRET-001] masks secret-looking task runtime output", async () => {
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner: new StaticScheduledTaskCommandRunner({
        exitCode: 1,
        stdout: "using abc123",
        stderr: "TOKEN=abc123",
      }),
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "failed",
      exitCode: 1,
      startedAt: "2026-05-05T00:30:00.000Z",
      finishedAt: "2026-05-05T00:30:00.000Z",
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "using ********",
        },
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stderr",
          message: "********",
        },
      ],
      failureSummary: "********",
    });
  });

  test("[SCHED-TASK-SECRET-001] masks secret-looking runtime errors", async () => {
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner: new ThrowingScheduledTaskCommandRunner(),
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-runtime-execution",
        error: "failed with ********",
      });
    }
  });

  test("[SCHED-TASK-RUNTIME-004] injects stable run context into hermetic task commands", async () => {
    const commandRunner = new CapturingScheduledTaskCommandRunner();
    const runtime = new HermeticScheduledTaskRuntimePort({
      commandRunner,
      now: () => "2026-05-05T00:30:00.000Z",
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        APPALOFT_RESOURCE_ID: "spoofed",
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(commandRunner.input?.environment).toMatchObject({
      API_TOKEN: "abc123",
      APPALOFT_SCHEDULED_TASK_RUN_ID: "str_manual",
      APPALOFT_SCHEDULED_TASK_ID: "tsk_migrate",
      APPALOFT_RESOURCE_ID: "res_api",
    });
  });
});

describe("RuntimeTargetScheduledTaskRuntimePort", () => {
  test("[SCHED-TASK-RUNTIME-002] renders Docker container task commands inside the resource runtime network namespace", () => {
    const result = renderDockerContainerScheduledTaskCommand({
      taskContainerName: "appaloft-task-str_manual",
      sourceContainerName: "appaloft-api",
      image: "registry.example.com/app:dep_live",
      commandIntent: "bun run migrate",
      environment: {
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(
      [
        "docker rm -f 'appaloft-task-str_manual' >/dev/null 2>&1 || true",
        "docker inspect 'appaloft-api' >/dev/null",
        "docker run --rm --name 'appaloft-task-str_manual' --network 'container:appaloft-api' --env 'API_TOKEN=abc123' 'registry.example.com/app:dep_live' sh -lc 'bun run migrate'",
      ].join("; "),
    );
  });

  test("[SCHED-TASK-RUNTIME-002] renders Docker Compose task commands against the target service", () => {
    const result = renderDockerComposeScheduledTaskCommand({
      composeFile: "/srv/app/compose.yml",
      projectName: "appaloft-dep-live",
      serviceName: "api",
      commandIntent: "bun run migrate",
      environment: {
        API_TOKEN: "abc123",
      },
      workdir: "/app",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(
      "docker compose -p 'appaloft-dep-live' -f '/srv/app/compose.yml' run --rm --no-deps --env 'API_TOKEN=abc123' --workdir '/app' 'api' sh -lc 'bun run migrate'",
    );
  });

  test("[SCHED-TASK-RUNTIME-002] renders Docker Swarm task commands as one-off job services", () => {
    const result = renderDockerSwarmScheduledTaskCommand({
      taskServiceName: "appaloft-task-str-swarm",
      sourceServiceName: "appaloft-res-api-dst-prod-dep-live_web",
      networkName: "appaloft-edge",
      image: "registry.example.com/app:dep_live",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        API_TOKEN: "abc123",
      },
      labels: {
        "appaloft.scheduled-task-run-id": "str_swarm",
      },
    });

    expect(result.isOk()).toBe(true);
    const command = result._unsafeUnwrap();
    expect(command).toContain("docker service inspect 'appaloft-res-api-dst-prod-dep-live_web'");
    expect(command).toContain(
      "docker service create --name 'appaloft-task-str-swarm' --restart-condition none --mode replicated-job --network 'appaloft-edge'",
    );
    expect(command).toContain("--label 'appaloft.scheduled-task-run-id=str_swarm'");
    expect(command).toContain("--env 'API_TOKEN=abc123'");
    expect(command).toContain("'registry.example.com/app:dep_live' sh -lc 'bun run migrate'");
    expect(command).toContain("docker service logs 'appaloft-task-str-swarm'");
    expect(command).toContain("docker service rm 'appaloft-task-str-swarm'");
    expect(Bun.spawnSync(["sh", "-n", "-c", command]).exitCode).toBe(0);
  });

  test("[SCHED-TASK-RUNTIME-003] executes scheduled task commands over generic SSH Docker runtime targets", async () => {
    let capturedProcess: ScheduledTaskProcessRunnerInput | undefined;
    const runtime = new RuntimeTargetScheduledTaskRuntimePort({
      deploymentReadModel: new StaticDeploymentReadModel(deploymentSummary()),
      serverRepository: new StaticServerRepository(sshServer()),
      now: () => "2026-05-05T00:30:00.000Z",
      processRunner: async (input) => {
        capturedProcess = input;
        return {
          exitCode: 0,
          stdout: "migration finished",
          stderr: "",
          failed: false,
          timedOut: false,
        };
      },
    });

    const result = await runtime.execute(context(), {
      runId: "str_manual",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "succeeded",
      exitCode: 0,
      startedAt: "2026-05-05T00:30:00.000Z",
      finishedAt: "2026-05-05T00:30:00.000Z",
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "migration finished",
        },
      ],
    });
    expect(capturedProcess?.command[0]).toBe("ssh");
    expect(capturedProcess?.command).toContain("deployer@203.0.113.10");
    expect(capturedProcess?.command).toContain("2222");
    expect(capturedProcess?.command.at(-1)).toContain("--network 'container:appaloft-api'");
    expect(capturedProcess?.command.at(-1)).toContain("'registry.example.com/app:dep_live'");
  });

  test("[SCHED-TASK-RUNTIME-002] executes scheduled task commands on local-shell Docker runtime targets", async () => {
    let capturedProcess: ScheduledTaskProcessRunnerInput | undefined;
    const runtime = new RuntimeTargetScheduledTaskRuntimePort({
      deploymentReadModel: new StaticDeploymentReadModel(
        deploymentSummary({
          providerKey: "local-shell",
          serverId: "srv_local",
        }),
      ),
      serverRepository: new StaticServerRepository(null),
      now: () => "2026-05-05T00:30:00.000Z",
      processRunner: async (input) => {
        capturedProcess = input;
        return {
          exitCode: 0,
          stdout: "local migration finished",
          stderr: "",
          failed: false,
          timedOut: false,
        };
      },
    });

    const result = await runtime.execute(context(), {
      runId: "str_local",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "local migration finished",
        },
      ],
    });
    expect(capturedProcess?.command[0]).toBe("sh");
    expect(capturedProcess?.command.at(-1)).toContain(
      "docker run --rm --name 'appaloft-task-str_local' --network 'container:appaloft-api'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "--env 'APPALOFT_SCHEDULED_TASK_RUN_ID=str_local'",
    );
    expect(capturedProcess?.command.at(-1)).toContain("--env 'APPALOFT_RUNTIME_PROVIDER=local-shell'");
    expect(capturedProcess?.command.at(-1)).toContain(
      "'registry.example.com/app:dep_live' sh -lc 'bun run migrate'",
    );
  });

  test("[SCHED-TASK-RUNTIME-003] executes scheduled task commands on local-shell Docker Compose runtime targets", async () => {
    let capturedProcess: ScheduledTaskProcessRunnerInput | undefined;
    const runtime = new RuntimeTargetScheduledTaskRuntimePort({
      deploymentReadModel: new StaticDeploymentReadModel(
        deploymentSummary({
          providerKey: "local-shell",
          serverId: "srv_local",
          executionKind: "docker-compose-stack",
          metadata: {
            composeFile: "/srv/app/compose.yml",
            composeProjectName: "appaloft-dep-live",
            targetServiceName: "api",
            workdir: "/srv/app",
            containerWorkdir: "/app",
          },
        }),
      ),
      serverRepository: new StaticServerRepository(null),
      now: () => "2026-05-05T00:30:00.000Z",
      processRunner: async (input) => {
        capturedProcess = input;
        return {
          exitCode: 0,
          stdout: "compose migration finished",
          stderr: "",
          failed: false,
          timedOut: false,
        };
      },
    });

    const result = await runtime.execute(context(), {
      runId: "str_compose",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "compose migration finished",
        },
      ],
    });
    expect(capturedProcess?.command[0]).toBe("sh");
    expect(capturedProcess?.command.at(-1)).toContain(
      "cd '/srv/app' && docker compose -p 'appaloft-dep-live' -f '/srv/app/compose.yml' run --rm --no-deps",
    );
    expect(capturedProcess?.command.at(-1)).toContain("--env 'API_TOKEN=abc123'");
    expect(capturedProcess?.command.at(-1)).toContain(
      "--env 'APPALOFT_SCHEDULED_TASK_RUN_ID=str_compose'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "--env 'APPALOFT_RUNTIME_EXECUTION_KIND=docker-compose-stack'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "--workdir '/app' 'api' sh -lc 'bun run migrate'",
    );
  });

  test("[SCHED-TASK-RUNTIME-003] executes scheduled task commands over generic SSH Docker Compose runtime targets", async () => {
    let capturedProcess: ScheduledTaskProcessRunnerInput | undefined;
    const runtime = new RuntimeTargetScheduledTaskRuntimePort({
      deploymentReadModel: new StaticDeploymentReadModel(
        deploymentSummary({
          executionKind: "docker-compose-stack",
          metadata: {
            composeFile: "/var/lib/appaloft/runtime/ssh-deployments/dep_live/source/compose.yml",
            composeProjectName: "appaloft-dep-live",
            targetServiceName: "api",
            remoteWorkdir: "/var/lib/appaloft/runtime/ssh-deployments/dep_live/source",
          },
        }),
      ),
      serverRepository: new StaticServerRepository(sshServer()),
      now: () => "2026-05-05T00:30:00.000Z",
      processRunner: async (input) => {
        capturedProcess = input;
        return {
          exitCode: 0,
          stdout: "ssh compose migration finished",
          stderr: "",
          failed: false,
          timedOut: false,
        };
      },
    });

    const result = await runtime.execute(context(), {
      runId: "str_ssh_compose",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "ssh compose migration finished",
        },
      ],
    });
    expect(capturedProcess?.command[0]).toBe("ssh");
    expect(capturedProcess?.command).toContain("deployer@203.0.113.10");
    expect(capturedProcess?.command.at(-1)).toContain(
      "cd '/var/lib/appaloft/runtime/ssh-deployments/dep_live/source' && docker compose -p 'appaloft-dep-live'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "-f '/var/lib/appaloft/runtime/ssh-deployments/dep_live/source/compose.yml' run --rm --no-deps",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "--env 'APPALOFT_RUNTIME_PROVIDER=generic-ssh'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "'api' sh -lc 'bun run migrate'",
    );
  });

  test("[SCHED-TASK-RUNTIME-003] executes scheduled task commands on Docker Swarm runtime targets", async () => {
    let capturedProcess: ScheduledTaskProcessRunnerInput | undefined;
    const runtime = new RuntimeTargetScheduledTaskRuntimePort({
      deploymentReadModel: new StaticDeploymentReadModel(
        deploymentSummary({
          providerKey: "docker-swarm",
          serverId: "srv_swarm",
          targetKind: "orchestrator-cluster",
          metadata: {
            "swarm.serviceName": "appaloft-res-api-dst-prod-dep-live_web",
            "swarm.networkName": "appaloft-edge",
          },
        }),
      ),
      serverRepository: new StaticServerRepository(null),
      now: () => "2026-05-05T00:30:00.000Z",
      processRunner: async (input) => {
        capturedProcess = input;
        return {
          exitCode: 0,
          stdout: "swarm migration finished",
          stderr: "",
          failed: false,
          timedOut: false,
        };
      },
    });

    const result = await runtime.execute(context(), {
      runId: "str_swarm",
      taskId: "tsk_migrate",
      resourceId: "res_api",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      environment: {
        API_TOKEN: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      timeline: [
        {
          timestamp: "2026-05-05T00:30:00.000Z",
          stream: "stdout",
          message: "swarm migration finished",
        },
      ],
    });
    expect(capturedProcess?.command).toEqual([
      "sh",
      "-lc",
      expect.stringContaining("docker service inspect 'appaloft-res-api-dst-prod-dep-live_web'"),
    ]);
    expect(capturedProcess?.command.at(-1)).toContain(
      "docker service create --name 'appaloft-task-str_swarm'",
    );
    expect(capturedProcess?.command.at(-1)).toContain("--mode replicated-job");
    expect(capturedProcess?.command.at(-1)).toContain("--network 'appaloft-edge'");
    expect(capturedProcess?.command.at(-1)).toContain("--env 'API_TOKEN=abc123'");
    expect(capturedProcess?.command.at(-1)).toContain(
      "--env 'APPALOFT_DEPLOYMENT_ID=dep_live'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "--env 'APPALOFT_RUNTIME_PROVIDER=docker-swarm'",
    );
    expect(capturedProcess?.command.at(-1)).toContain(
      "--label 'appaloft.scheduled-task-run-id=str_swarm'",
    );
  });
});
