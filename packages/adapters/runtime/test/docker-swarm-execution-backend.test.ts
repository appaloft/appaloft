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

function runtimeEnvironmentSnapshot(): EnvironmentConfigSnapshot {
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
        key: ConfigKey.rehydrate("DATABASE_URL"),
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

function runtimePlan(): RuntimePlan {
  const accessRoute = AccessRoute.rehydrate({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.rehydrate("api.example.com")],
    pathPrefix: RoutePathPrefix.rehydrate("/"),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: PortNumber.rehydrate(3000),
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
      port: PortNumber.rehydrate(3000),
      image: ImageReference.rehydrate("registry.example.com/team/app:sha"),
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
          port: PortNumber.rehydrate(3000),
          path: HealthCheckPathText.rehydrate("/healthz"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
      image: ImageReference.rehydrate("registry.example.com/team/app:sha"),
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

function runningDeployment(): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate("dep_swarm_backend"),
    projectId: ProjectId.rehydrate("prj_app"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    resourceId: ResourceId.rehydrate("res_api"),
    serverId: DeploymentTargetId.rehydrate("dtg_swarm_1"),
    destinationId: DestinationId.rehydrate("dst_prod"),
    runtimePlan: runtimePlan(),
    environmentSnapshot: runtimeEnvironmentSnapshot(),
    createdAt: CreatedAt.rehydrate("2026-04-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(startedAt)._unsafeUnwrap();
  deployment.markPlanned(startedAt)._unsafeUnwrap();
  deployment.start(startedAt)._unsafeUnwrap();
  return deployment;
}

describe("DockerSwarmExecutionBackend", () => {
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
});
