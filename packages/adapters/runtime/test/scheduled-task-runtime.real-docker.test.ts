import "../../../application/node_modules/reflect-metadata/Reflect.js";
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ash } from "@appaloft/ash";
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
import { RuntimeTargetScheduledTaskRuntimePort } from "../src/scheduled-task-runtime";

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployment: DeploymentSummary) {}

  async list(): Promise<DeploymentSummary[]> {
    return [this.deployment];
  }

  async findOne(): Promise<DeploymentSummary> {
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

interface ProcessResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface SshConfig {
  host: string;
  port: string;
  privateKeyFile: string;
  privateKeyText: string;
  username: string;
}

const localDockerEnabled = process.env.APPALOFT_E2E_SCHEDULED_TASK_DOCKER === "true";
const sshDockerEnabled = process.env.APPALOFT_E2E_SSH_SCHEDULED_TASK_DOCKER === "true";
const smokeImage = process.env.APPALOFT_E2E_SCHEDULED_TASK_IMAGE ?? "alpine:3.20";

function context(): ExecutionContext {
  return {
    locale: "en",
    requestId: "req_scheduled_task_real_runtime_smoke",
    entrypoint: "system",
    t: (key) => key,
    tracer: {
      async startActiveSpan(_name, _options, callback) {
        return callback(new NoopAppSpan());
      },
    },
  };
}

function docker(args: readonly string[]): ProcessResult {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(["docker", ...args], {
      stderr: "pipe",
      stdout: "pipe",
    });
  } catch (error) {
    return {
      exitCode: 127,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }

  return {
    exitCode: result.exitCode,
    stderr: (result.stderr ?? new Uint8Array()).toString(),
    stdout: (result.stdout ?? new Uint8Array()).toString(),
  };
}

function safeDockerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function ensureLocalDockerImage(image: string): void {
  if (docker(["image", "inspect", image]).exitCode === 0) {
    return;
  }

  const pulled = docker(["pull", image]);
  expect(pulled.exitCode, pulled.stderr).toBe(0);
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function sshConfig(): SshConfig {
  const host = process.env.APPALOFT_E2E_SSH_HOST;
  const privateKeyFile = expandHome(process.env.APPALOFT_E2E_SSH_PRIVATE_KEY ?? "~/.ssh/appaloft");

  if (!host) {
    throw new Error("APPALOFT_E2E_SSH_HOST is required when APPALOFT_E2E_SSH_SCHEDULED_TASK_DOCKER=true");
  }

  if (!existsSync(privateKeyFile)) {
    throw new Error(`SSH private key file does not exist: ${privateKeyFile}`);
  }

  return {
    host,
    port: process.env.APPALOFT_E2E_SSH_PORT ?? "22",
    privateKeyFile,
    privateKeyText: readFileSync(privateKeyFile, "utf8"),
    username: process.env.APPALOFT_E2E_SSH_USERNAME ?? "root",
  };
}

function ssh(config: SshConfig, command: string): ProcessResult {
  const result = Bun.spawnSync(
    [
      "ssh",
      "-i",
      config.privateKeyFile,
      "-p",
      config.port,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${config.username}@${config.host}`,
      command,
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  return {
    exitCode: result.exitCode,
    stderr: (result.stderr ?? new Uint8Array()).toString(),
    stdout: (result.stdout ?? new Uint8Array()).toString(),
  };
}

function ensureRemoteDockerImage(config: SshConfig, image: string): void {
  if (ssh(config, `docker image inspect ${ash.quote(image)} >/dev/null`).exitCode === 0) {
    return;
  }

  const pulled = ssh(config, `docker pull ${ash.quote(image)}`);
  expect(pulled.exitCode, pulled.stderr).toBe(0);
}

function deploymentSummary(input: {
  containerName: string;
  providerKey: "generic-ssh" | "local-shell";
  serverId: string;
}): DeploymentSummary {
  return {
    id: "dep_scheduled_task_smoke",
    projectId: "prj_scheduled_task_smoke",
    environmentId: "env_scheduled_task_smoke",
    resourceId: "res_scheduled_task_smoke",
    serverId: input.serverId,
    destinationId: "dst_scheduled_task_smoke",
    status: "succeeded",
    runtimePlan: {
      id: "rtp_scheduled_task_smoke",
      source: {
        kind: "remote-git",
        locator: "https://example.com/app.git",
        displayName: "scheduled-task-smoke",
      },
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      runtimeArtifact: {
        kind: "image",
        intent: "build-image",
        image: smokeImage,
      },
      execution: {
        kind: "docker-container",
        image: smokeImage,
        metadata: {
          containerName: input.containerName,
        },
      },
      target: {
        kind: "single-server",
        providerKey: input.providerKey,
        serverIds: [input.serverId],
      },
      detectSummary: "scheduled task real runtime smoke",
      generatedAt: "2026-05-15T00:00:00.000Z",
      steps: [],
    },
    environmentSnapshot: {
      id: "envsnap_scheduled_task_smoke",
      environmentId: "env_scheduled_task_smoke",
      createdAt: "2026-05-15T00:00:00.000Z",
      precedence: [],
      variables: [],
    },
    timeline: [],
    createdAt: "2026-05-15T00:00:00.000Z",
    logCount: 0,
  };
}

function sshServer(config: SshConfig): Server {
  return Server.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_scheduled_task_ssh"),
    name: DeploymentTargetName.rehydrate("Scheduled task SSH smoke"),
    host: HostAddress.rehydrate(config.host),
    port: PortNumber.rehydrate(Number(config.port)),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    credential: {
      kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
      username: DeploymentTargetUsername.rehydrate(config.username),
      privateKey: SshPrivateKeyText.rehydrate(config.privateKeyText),
    },
    createdAt: CreatedAt.rehydrate("2026-05-15T00:00:00.000Z"),
  });
}

function commandIntent(marker: string, providerKey: string): string {
  return [
    `echo ${ash.quote(marker)}`,
    'test "$APPALOFT_SCHEDULED_TASK_RUN_ID" = "str_real_runtime"',
    'test "$APPALOFT_SCHEDULED_TASK_ID" = "tsk_real_runtime"',
    'test "$APPALOFT_RESOURCE_ID" = "res_scheduled_task_smoke"',
    `test "$APPALOFT_RUNTIME_PROVIDER" = ${ash.quote(providerKey)}`,
    'test "$APPALOFT_RUNTIME_EXECUTION_KIND" = "docker-container"',
    'test "$API_TOKEN" = "abc123"',
  ].join("; ");
}

describe("scheduled task runtime real Docker smoke", () => {
  if (!localDockerEnabled) {
    test.skip("[SCHED-TASK-RUNTIME-005] local explicit Docker smoke requires APPALOFT_E2E_SCHEDULED_TASK_DOCKER=true", () => {});
  } else {
    test("[SCHED-TASK-RUNTIME-005] executes a real one-off local Docker scheduled task container", async () => {
      const dockerVersion = docker(["version", "--format", "{{.Server.Version}}"]);
      expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);
      ensureLocalDockerImage(smokeImage);

      const sourceContainer = safeDockerName(`appaloft-scheduled-task-source-${crypto.randomUUID()}`);
      const started = docker(["run", "-d", "--name", sourceContainer, smokeImage, "sh", "-lc", "sleep 300"]);
      expect(started.exitCode, started.stderr).toBe(0);

      try {
        const runtime = new RuntimeTargetScheduledTaskRuntimePort({
          deploymentReadModel: new StaticDeploymentReadModel(
            deploymentSummary({
              containerName: sourceContainer,
              providerKey: "local-shell",
              serverId: "srv_scheduled_task_local",
            }),
          ),
          serverRepository: new StaticServerRepository(null),
        });

        const result = await runtime.execute(context(), {
          runId: "str_real_runtime",
          taskId: "tsk_real_runtime",
          resourceId: "res_scheduled_task_smoke",
          commandIntent: commandIntent("scheduled-task-real-local-docker", "local-shell"),
          timeoutSeconds: 30,
          environment: {
            API_TOKEN: "abc123",
          },
        });

        expect(result.isOk()).toBe(true);
        const execution = result._unsafeUnwrap();
        expect(execution.status).toBe("succeeded");
        expect(execution.exitCode).toBe(0);
        expect(execution.timeline.map((entry) => entry.message).join("\n")).toContain(
          "scheduled-task-real-local-docker",
        );
      } finally {
        docker(["rm", "-f", sourceContainer]);
      }
    }, 120000);
  }
});

describe("scheduled task runtime real SSH Docker smoke", () => {
  if (!sshDockerEnabled) {
    test.skip("[SCHED-TASK-RUNTIME-006] local explicit SSH Docker smoke requires APPALOFT_E2E_SSH_SCHEDULED_TASK_DOCKER=true", () => {});
  } else {
    test("[SCHED-TASK-RUNTIME-006] executes a real one-off scheduled task container over generic SSH", async () => {
      const config = sshConfig();
      const dockerVersion = ssh(config, "docker version --format '{{.Server.Version}}'");
      expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);
      ensureRemoteDockerImage(config, smokeImage);

      const sourceContainer = safeDockerName(`appaloft-scheduled-task-ssh-source-${crypto.randomUUID()}`);
      const started = ssh(
        config,
        [
          `docker rm -f ${ash.quote(sourceContainer)} >/dev/null 2>&1 || true`,
          `docker run -d --name ${ash.quote(sourceContainer)} ${ash.quote(smokeImage)} sh -lc 'sleep 300'`,
        ].join("; "),
      );
      expect(started.exitCode, started.stderr).toBe(0);

      try {
        const runtime = new RuntimeTargetScheduledTaskRuntimePort({
          deploymentReadModel: new StaticDeploymentReadModel(
            deploymentSummary({
              containerName: sourceContainer,
              providerKey: "generic-ssh",
              serverId: "srv_scheduled_task_ssh",
            }),
          ),
          serverRepository: new StaticServerRepository(sshServer(config)),
        });

        const result = await runtime.execute(context(), {
          runId: "str_real_runtime",
          taskId: "tsk_real_runtime",
          resourceId: "res_scheduled_task_smoke",
          commandIntent: commandIntent("scheduled-task-real-ssh-docker", "generic-ssh"),
          timeoutSeconds: 30,
          environment: {
            API_TOKEN: "abc123",
          },
        });

        expect(result.isOk()).toBe(true);
        const execution = result._unsafeUnwrap();
        expect(execution.status).toBe("succeeded");
        expect(execution.exitCode).toBe(0);
        expect(execution.timeline.map((entry) => entry.message).join("\n")).toContain(
          "scheduled-task-real-ssh-docker",
        );
      } finally {
        ssh(config, `docker rm -f ${ash.quote(sourceContainer)} >/dev/null 2>&1 || true`);
      }
    }, 120000);
  }
});
