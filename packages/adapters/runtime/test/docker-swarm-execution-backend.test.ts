import { mkdtempSync, rmSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EdgeProxyKindValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  GeneratedAt,
  HealthCheckExpectedStatusCode,
  HealthCheckHostText,
  HealthCheckHttpMethodValue,
  HealthCheckIntervalSeconds,
  HealthCheckPathText,
  HealthCheckRetryCount,
  HealthCheckSchemeValue,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  ImageReference,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  RoutePathPrefix,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  TlsModeValue,
  VariableExposureValue,
  VariableKindValue,
  ok,
  type Result,
} from "@appaloft/core";
import { type ExecutionContext } from "@appaloft/application";
import {
  DockerSwarmExecutionBackend,
  DockerSwarmShellCommandRunner,
  type DockerSwarmCommandRunner,
  type DockerSwarmCommandRunnerInput,
  type DockerSwarmCommandRunnerResult,
} from "../src/docker-swarm-execution-backend";

const generatedAt = GeneratedAt.rehydrate("2026-04-01T00:00:00.000Z");
const startedAt = StartedAt.rehydrate("2026-04-01T00:01:00.000Z");

class RecordingSwarmCommandRunner implements DockerSwarmCommandRunner {
  readonly calls: DockerSwarmCommandRunnerInput[] = [];

  async run(
    input: DockerSwarmCommandRunnerInput,
  ): Promise<Result<DockerSwarmCommandRunnerResult>> {
    this.calls.push(input);
    return ok({ exitCode: 0, stdout: "ok" });
  }
}

class FailingVerifySwarmCommandRunner implements DockerSwarmCommandRunner {
  readonly calls: DockerSwarmCommandRunnerInput[] = [];

  async run(
    input: DockerSwarmCommandRunnerInput,
  ): Promise<Result<DockerSwarmCommandRunnerResult>> {
    this.calls.push(input);
    if (input.step === "verify-candidate-service") {
      return ok({
        exitCode: 22,
        stderr: "candidate service failed health verification",
      });
    }

    return ok({ exitCode: 0 });
  }
}

class SecretLeakingVerifySwarmCommandRunner implements DockerSwarmCommandRunner {
  readonly calls: DockerSwarmCommandRunnerInput[] = [];

  async run(
    input: DockerSwarmCommandRunnerInput,
  ): Promise<Result<DockerSwarmCommandRunnerResult>> {
    this.calls.push(input);
    if (input.step === "verify-candidate-service") {
      return ok({
        exitCode: 22,
        stderr: [
          "Authorization: Bearer raw-registry-token",
          "Cookie: session=raw-cookie",
          "password=raw-password",
          "postgres://secret-value",
          "ssh://deploy:raw-ssh-password@example.test",
          "-----BEGIN PRIVATE KEY----- raw-key -----END PRIVATE KEY-----",
        ].join(" "),
      });
    }

    return ok({ exitCode: 0 });
  }
}

function createContext(): ExecutionContext {
  return {
    entrypoint: "system",
    locale: "en",
    requestId: "req_swarm_backend",
    t: ((key: string) => key) as ExecutionContext["t"],
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

function runtimeEnvironmentSnapshot(input: { secretKey?: string } = {}): EnvironmentConfigSnapshot {
  const secretKey = input.secretKey ?? "DATABASE_URL";

  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate("envsnap_swarm_backend"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    createdAt: generatedAt,
    precedence: [
      ConfigScopeValue.rehydrate("defaults"),
      ConfigScopeValue.rehydrate("environment"),
      ConfigScopeValue.rehydrate("deployment"),
    ],
    variables: [
      {
        key: ConfigKey.rehydrate(secretKey),
        value: ConfigValueText.rehydrate("postgres://secret-value"),
        kind: VariableKindValue.rehydrate("secret"),
        exposure: VariableExposureValue.rehydrate("runtime"),
        scope: ConfigScopeValue.rehydrate("environment"),
        isSecret: true,
      },
      {
        key: ConfigKey.rehydrate("PUBLIC_FLAG"),
        value: ConfigValueText.rehydrate("enabled"),
        kind: VariableKindValue.rehydrate("plain-config"),
        exposure: VariableExposureValue.rehydrate("runtime"),
        scope: ConfigScopeValue.rehydrate("deployment"),
        isSecret: false,
      },
    ],
  });
}

function runtimePlan(
  input: { healthPath?: string; image?: string; metadata?: Record<string, string>; port?: number } = {},
): RuntimePlan {
  const image = ImageReference.rehydrate(input.image ?? "registry.example.com/team/app:sha");
  const port = PortNumber.rehydrate(input.port ?? 3000);
  const accessRoute = AccessRoute.rehydrate({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.rehydrate("api.example.com")],
    pathPrefix: RoutePathPrefix.rehydrate("/"),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: port,
  });

  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_swarm_backend"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("remote-git"),
      locator: SourceLocator.rehydrate("https://github.com/acme/app.git"),
      displayName: DisplayNameText.rehydrate("Acme App"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      port,
      image,
      accessRoutes: [accessRoute],
      healthCheck: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("http"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(10),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(5),
        retries: HealthCheckRetryCount.rehydrate(3),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(0),
        http: {
          method: HealthCheckHttpMethodValue.rehydrate("GET"),
          scheme: HealthCheckSchemeValue.rehydrate("http"),
          host: HealthCheckHostText.rehydrate("127.0.0.1"),
          port,
          path: HealthCheckPathText.rehydrate(input.healthPath ?? "/healthz"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
      image,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("orchestrator-cluster"),
      providerKey: ProviderKey.rehydrate("docker-swarm"),
      serverIds: [DeploymentTargetId.rehydrate("dtg_swarm_1")],
    }),
    detectSummary: DetectSummary.rehydrate("Prebuilt image"),
    steps: [PlanStepText.rehydrate("Deploy Docker Swarm service")],
    generatedAt,
  });
}

function runningDeployment(
  input: {
    deploymentId?: string;
    healthPath?: string;
    image?: string;
    metadata?: Record<string, string>;
    port?: number;
    secretKey?: string;
  } = {},
): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.deploymentId ?? "dep_swarm_backend"),
    projectId: ProjectId.rehydrate("prj_app"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    resourceId: ResourceId.rehydrate("res_api"),
    serverId: DeploymentTargetId.rehydrate("dtg_swarm_1"),
    destinationId: DestinationId.rehydrate("dst_prod"),
    runtimePlan: runtimePlan(input),
    environmentSnapshot: runtimeEnvironmentSnapshot(input),
    createdAt: CreatedAt.rehydrate("2026-04-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(startedAt)._unsafeUnwrap();
  deployment.markPlanned(startedAt)._unsafeUnwrap();
  deployment.start(startedAt)._unsafeUnwrap();
  return deployment;
}

function commandOutput(command: string[]): string {
  const result = Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command.join(" ")}`,
        result.stdout.toString(),
        result.stderr.toString(),
      ].join("\n"),
    );
  }

  return result.stdout.toString().trim();
}

function commandStatus(command: string[]): number {
  return Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
  }).exitCode;
}

function commandOutputWithStdinFile(command: string[], stdin: Blob): string {
  const result = Bun.spawnSync(command, {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command.join(" ")}`,
        result.stdout.toString(),
        result.stderr.toString(),
      ].join("\n"),
    );
  }

  return result.stdout.toString().trim();
}

async function commandOutputWithStdinFileRetry(input: {
  attempts: number;
  command: string[];
  stdinPath: string;
}): Promise<string> {
  let lastOutput = "";
  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    const result = Bun.spawnSync(input.command, {
      stdin: Bun.file(input.stdinPath),
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) {
      return result.stdout.toString().trim();
    }

    lastOutput = [result.stdout.toString(), result.stderr.toString()].join("\n").trim();
    await Bun.sleep(500);
  }

  throw new Error(
    [`Command failed: ${input.command.join(" ")}`, lastOutput].filter(Boolean).join("\n"),
  );
}

async function prepareAuthenticatedRegistryImage(input: {
  baseImage: string;
  password: string;
  username: string;
}): Promise<{ authDir: string; image: string; registryAddress: string; registryName: string }> {
  const registryName = "appaloft-swarm-smoke-registry";
  const registryAddress = `127.0.0.1:${Bun.env.APPALOFT_DOCKER_SWARM_REGISTRY_PORT ?? "5001"}`;
  const image = `${registryAddress}/appaloft-smoke-nginx:auth`;
  const authDir = mkdtempSync(`${process.cwd()}/.tmp-appaloft-swarm-registry-auth-`);
  const passwordPath = `${authDir}/password`;
  const htpasswdPath = Bun.env.APPALOFT_HTPASSWD_PATH ?? "/usr/sbin/htpasswd";

  try {
    await Bun.write(passwordPath, `${input.password}\n`);
    const htpasswd = commandOutputWithStdinFile(
      [htpasswdPath, "-Bbn", "-i", input.username],
      Bun.file(passwordPath),
    );
    await Bun.write(`${authDir}/htpasswd`, htpasswd);

    commandStatus(["docker", "container", "rm", "-f", registryName]);
    commandOutput(["docker", "pull", input.baseImage]);
    commandOutput(["docker", "pull", "registry:2"]);
    commandOutput([
      "docker",
      "run",
      "-d",
      "--name",
      registryName,
      "-p",
      `${registryAddress}:5000`,
      "-v",
      `${authDir}:/auth`,
      "-e",
      "REGISTRY_AUTH=htpasswd",
      "-e",
      "REGISTRY_AUTH_HTPASSWD_REALM=Appaloft Swarm Smoke",
      "-e",
      "REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd",
      "registry:2",
    ]);
    await commandOutputWithStdinFileRetry({
      attempts: 20,
      command: ["docker", "login", registryAddress, "-u", input.username, "--password-stdin"],
      stdinPath: passwordPath,
    });
    commandOutput(["docker", "tag", input.baseImage, image]);
    commandOutput(["docker", "push", image]);
    commandStatus(["docker", "image", "rm", image]);
  } catch (error) {
    const registryLogsResult = Bun.spawnSync(["docker", "logs", registryName], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const registryLogs = [registryLogsResult.stdout.toString(), registryLogsResult.stderr.toString()]
      .join("\n")
      .trim();
    const sanitizedRegistryLogs = registryLogs
      .replaceAll(input.password, "********")
      .replace(/password=[^\s]+/gi, "password=********");
    commandStatus(["docker", "logout", registryAddress]);
    commandStatus(["docker", "container", "rm", "-f", registryName]);
    commandStatus(["docker", "image", "rm", image]);
    rmSync(authDir, { force: true, recursive: true });
    const message = error instanceof Error ? error.message : "Authenticated registry setup failed";
    throw new Error(
      [message, sanitizedRegistryLogs ? `Registry logs:\n${sanitizedRegistryLogs}` : ""]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    authDir,
    image,
    registryAddress,
    registryName,
  };
}

const realSwarmSmokeTest = Bun.env.APPALOFT_DOCKER_SWARM_SMOKE === "1" ? test : test.skip;

describe("DockerSwarmExecutionBackend", () => {
  test("[SWARM-TARGET-APPLY-001][SWARM-TARGET-CLEAN-001] shell command runner executes bounded Swarm commands", async () => {
    const runner = new DockerSwarmShellCommandRunner();

    const result = await runner.run({
      step: "verify-candidate-service",
      command: "printf 'swarm-ok'",
      displayCommand: "printf 'swarm-ok'",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      exitCode: 0,
      stdout: "swarm-ok",
      stderr: "",
    });
  });

  test("[SWARM-TARGET-APPLY-002] shell command runner preserves nonzero exit output", async () => {
    const runner = new DockerSwarmShellCommandRunner();

    const result = await runner.run({
      step: "verify-candidate-service",
      command: "printf 'swarm-error' >&2; exit 17",
      displayCommand: "printf 'swarm-error' >&2; exit 17",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      exitCode: 17,
      stdout: "",
      stderr: "swarm-error",
    });
  });

  test("[SWARM-TARGET-APPLY-002] shell command runner times out bounded Swarm commands", async () => {
    const runner = new DockerSwarmShellCommandRunner({ timeoutMs: 1 });

    const result = await runner.run({
      step: "verify-candidate-service",
      command: "sleep 2",
      displayCommand: "sleep 2",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      exitCode: 124,
      stderr: "Docker Swarm command timed out at verify-candidate-service.",
    });
  });

  test("[SWARM-TARGET-APPLY-001][SWARM-TARGET-CLEAN-001] executes fake Swarm apply commands without default registry activation", async () => {
    const runner = new RecordingSwarmCommandRunner();
    const backend = new DockerSwarmExecutionBackend(runner);

    const result = await backend.execute(createContext(), runningDeployment());

    expect(result.isOk()).toBe(true);
    const deployment = result._unsafeUnwrap().deployment.toState();

    expect(deployment.status.value).toBe("succeeded");
    expect(runner.calls.map((call) => call.step)).toEqual([
      "create-candidate-service",
      "verify-candidate-service",
      "promote-route-target",
      "cleanup-superseded-services",
    ]);
    expect(runner.calls[0]?.command).toContain(
      "--name 'appaloft-res-api-dst-prod-dep-swarm-backend_web'",
    );
    expect(runner.calls[0]?.command).toContain("--secret 'source=DATABASE_URL,target=DATABASE_URL'");
    expect(runner.calls[0]?.command).not.toContain("postgres://secret-value");
    expect(runner.calls[3]?.command).toContain(
      '); if [ "$current_deployment" != \'dep_swarm_backend\' ]; then',
    );
    expect(runner.calls[3]?.command).toContain('fi; done');
    expect(deployment.runtimePlan.execution.metadata).toMatchObject({
      "swarm.serviceName": "appaloft-res-api-dst-prod-dep-swarm-backend_web",
      "swarm.applyPlanSchemaVersion": "docker-swarm.apply-plan/v1",
    });
  });

  test("[SWARM-TARGET-CLEAN-001] executes fake Swarm cleanup through cancel using scoped labels", async () => {
    const runner = new RecordingSwarmCommandRunner();
    const backend = new DockerSwarmExecutionBackend(runner);

    const result = await backend.cancel(createContext(), runningDeployment());

    expect(result.isOk()).toBe(true);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.command).toContain(
      "--filter 'label=appaloft.deployment-id=dep_swarm_backend'",
    );
    expect(runner.calls[0]?.command).toContain("--filter 'label=appaloft.resource-id=res_api'");
    expect(runner.calls[0]?.command).not.toContain("docker system prune");
    expect(runner.calls[0]?.command).not.toContain("docker volume");
  });

  test("[SWARM-TARGET-ROUTE-001B] applies a configured Swarm edge network name", async () => {
    const runner = new RecordingSwarmCommandRunner();
    const backend = new DockerSwarmExecutionBackend(runner, undefined, {
      edgeNetworkName: "appaloft-smoke-edge",
    });

    const result = await backend.execute(createContext(), runningDeployment());

    expect(result.isOk()).toBe(true);
    expect(runner.calls[0]?.command).toContain("--network 'appaloft-smoke-edge'");
    expect(runner.calls[2]?.command).toContain("traefik.docker.network=appaloft-smoke-edge");
  });

  test("[SWARM-TARGET-APPLY-002][SWARM-TARGET-CLEAN-001] cleans only the failed candidate when fake verification fails", async () => {
    const runner = new FailingVerifySwarmCommandRunner();
    const backend = new DockerSwarmExecutionBackend(runner);

    const result = await backend.execute(createContext(), runningDeployment());

    expect(result.isOk()).toBe(true);
    const deployment = result._unsafeUnwrap().deployment.toState();

    expect(deployment.status.value).toBe("failed");
    expect(deployment.runtimePlan.execution.metadata).toMatchObject({
      phase: "verify-candidate-service",
      errorCode: "docker_swarm_command_failed",
      message: "candidate service failed health verification",
    });
    expect(runner.calls.map((call) => call.step)).toEqual([
      "create-candidate-service",
      "verify-candidate-service",
      "remove-services",
    ]);
    expect(runner.calls[2]?.command).toContain(
      "--filter 'label=appaloft.deployment-id=dep_swarm_backend'",
    );
    expect(runner.calls[2]?.command).toContain("--filter 'label=appaloft.resource-id=res_api'");
    expect(runner.calls[2]?.command).not.toContain("docker system prune");
    expect(runner.calls[2]?.command).not.toContain("docker volume");
  });

  test("[SWARM-TARGET-SECRET-001] redacts Swarm command failure output in deployment logs and metadata", async () => {
    const runner = new SecretLeakingVerifySwarmCommandRunner();
    const backend = new DockerSwarmExecutionBackend(runner);

    const result = await backend.execute(createContext(), runningDeployment());

    expect(result.isOk()).toBe(true);
    const deployment = result._unsafeUnwrap().deployment.toState();
    const serialized = JSON.stringify({
      logs: deployment.logs,
      metadata: deployment.runtimePlan.execution.metadata,
    });

    expect(serialized).toContain("********");
    expect(serialized).not.toContain("raw-registry-token");
    expect(serialized).not.toContain("raw-cookie");
    expect(serialized).not.toContain("raw-password");
    expect(serialized).not.toContain("postgres://secret-value");
    expect(serialized).not.toContain("raw-ssh-password");
    expect(serialized).not.toContain("raw-key");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
  });

  realSwarmSmokeTest(
    "[SWARM-TARGET-ROUTE-001B][SWARM-TARGET-SECRET-001B] runs opt-in real Swarm apply and cleanup",
    async () => {
      const swarmState = commandOutput([
        "docker",
        "info",
        "--format",
        "{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}",
      ]);
      expect(swarmState).toBe("active true");

      const edgeNetworkName =
        Bun.env.APPALOFT_DOCKER_SWARM_EDGE_NETWORK ?? "appaloft-edge";
      const edgeNetwork = commandOutput([
        "docker",
        "network",
        "inspect",
        edgeNetworkName,
        "--format",
        "{{.Driver}} {{.Scope}}",
      ]);
      expect(edgeNetwork).toBe("overlay swarm");

      const secretKey = "APPALOFT_SWARM_SMOKE_DATABASE_URL";
      const registryPassword = "appaloft-swarm-smoke-password";
      const registryUsername = "appaloft";
      let registry:
        | {
            authDir: string;
            image: string;
            registryAddress: string;
            registryName: string;
          }
        | undefined;
      const deployment = runningDeployment({
        healthPath: "/",
        image: Bun.env.APPALOFT_DOCKER_SWARM_SMOKE_IMAGE ?? "nginx:alpine",
        port: 80,
        secretKey,
      });
      const backend = new DockerSwarmExecutionBackend(
        new DockerSwarmShellCommandRunner({
          timeoutMs: Number(Bun.env.APPALOFT_DOCKER_SWARM_SMOKE_TIMEOUT_MS ?? "120000"),
        }),
        undefined,
        { edgeNetworkName },
      );

      try {
        commandStatus(["docker", "secret", "rm", secretKey]);
        commandOutput([
          "sh",
          "-c",
          `printf %s 'postgres://secret-value' | docker secret create ${secretKey} -`,
        ]);
        const result = await backend.execute(createContext(), deployment);
        expect(result.isOk()).toBe(true);
        const state = result._unsafeUnwrap().deployment.toState();
        if (state.status.value !== "succeeded") {
          throw new Error(
            JSON.stringify(
              {
                logs: state.logs,
                metadata: state.runtimePlan.execution.metadata,
              },
              null,
              2,
            ),
          );
        }
        expect(state.status.value).toBe("succeeded");
        expect(state.runtimePlan.execution.metadata).toMatchObject({
          "swarm.serviceName": "appaloft-res-api-dst-prod-dep-swarm-backend_web",
          "swarm.applyPlanSchemaVersion": "docker-swarm.apply-plan/v1",
        });
        expect(JSON.stringify(state.runtimePlan.execution.metadata)).not.toContain(
          "postgres://secret-value",
        );

        registry = await prepareAuthenticatedRegistryImage({
          baseImage: Bun.env.APPALOFT_DOCKER_SWARM_SMOKE_IMAGE ?? "nginx:alpine",
          password: registryPassword,
          username: registryUsername,
        });
        const privateDeployment = runningDeployment({
          deploymentId: "dep_swarm_registry",
          healthPath: "/",
          image: registry.image,
          metadata: {
            swarmRegistryAuthSecretRef: "secret:APPALOFT_SWARM_SMOKE_REGISTRY_AUTH",
          },
          port: 80,
          secretKey,
        });
        try {
          const privateResult = await backend.execute(createContext(), privateDeployment);
          expect(privateResult.isOk()).toBe(true);
          const privateState = privateResult._unsafeUnwrap().deployment.toState();
          if (privateState.status.value !== "succeeded") {
            throw new Error(
              JSON.stringify(
                {
                  logs: privateState.logs,
                  metadata: privateState.runtimePlan.execution.metadata,
                },
                null,
                2,
              ),
            );
          }
          expect(privateState.status.value).toBe("succeeded");
          const privateSerialized = JSON.stringify({
            logs: privateState.logs,
            metadata: privateState.runtimePlan.execution.metadata,
          });
          expect(privateSerialized).not.toContain(registryPassword);
          expect(privateSerialized).not.toContain("APPALOFT_SWARM_SMOKE_REGISTRY_AUTH");
          expect(privateSerialized).not.toContain("postgres://secret-value");
        } finally {
          await backend.cancel(createContext(), privateDeployment);
        }
      } finally {
        await backend.cancel(createContext(), deployment);
        commandStatus(["docker", "secret", "rm", secretKey]);
        if (registry) {
          commandStatus(["docker", "logout", registry.registryAddress]);
          commandStatus(["docker", "container", "rm", "-f", registry.registryName]);
          commandStatus(["docker", "image", "rm", registry.image]);
          rmSync(registry.authDir, { force: true, recursive: true });
        }
      }
    },
    Number(Bun.env.APPALOFT_DOCKER_SWARM_SMOKE_TIMEOUT_MS ?? "120000"),
  );
});
