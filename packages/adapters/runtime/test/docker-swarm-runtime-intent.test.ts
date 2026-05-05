import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DetectSummary,
  DisplayNameText,
  EdgeProxyKindValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  FilePathText,
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
  ProviderKey,
  PublicDomainName,
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
  TargetKindValue,
  TlsModeValue,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import {
  renderDockerSwarmCleanupPlan,
  renderDockerSwarmRuntimeIntent,
} from "../src/docker-swarm-runtime-intent";

const generatedAt = GeneratedAt.rehydrate("2026-04-01T00:00:00.000Z");

function baseTarget(): DeploymentTargetDescriptor {
  return DeploymentTargetDescriptor.rehydrate({
    kind: TargetKindValue.rehydrate("orchestrator-cluster"),
    providerKey: ProviderKey.rehydrate("docker-swarm"),
    serverIds: [DeploymentTargetId.rehydrate("dtg_swarm_1")],
  });
}

function baseSource(): SourceDescriptor {
  return SourceDescriptor.rehydrate({
    kind: SourceKindValue.rehydrate("remote-git"),
    locator: SourceLocator.rehydrate("https://github.com/acme/app.git"),
    displayName: DisplayNameText.rehydrate("Acme App"),
  });
}

function runtimeEnvironmentSnapshot(): EnvironmentConfigSnapshot {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate("envsnap_swarm"),
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

function imageRuntimePlan(): RuntimePlan {
  const accessRoute = AccessRoute.rehydrate({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.rehydrate("pr-1.example.com")],
    pathPrefix: RoutePathPrefix.rehydrate("/"),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: PortNumber.rehydrate(3000),
  });

  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_swarm_image"),
    source: baseSource(),
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
    target: baseTarget(),
    detectSummary: DetectSummary.rehydrate("Prebuilt image"),
    steps: [PlanStepText.rehydrate("Render Docker Swarm runtime intent")],
    generatedAt,
  });
}

function composeRuntimePlan(metadata?: Record<string, string>): RuntimePlan {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_swarm_compose"),
    source: baseSource(),
    buildStrategy: BuildStrategyKindValue.rehydrate("compose-deploy"),
    packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
      composeFile: FilePathText.rehydrate("docker-compose.yml"),
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
      intent: RuntimeArtifactIntentValue.rehydrate("compose-project"),
      composeFile: FilePathText.rehydrate("docker-compose.yml"),
      ...(metadata ? { metadata } : {}),
    }),
    target: baseTarget(),
    detectSummary: DetectSummary.rehydrate("Compose project"),
    steps: [PlanStepText.rehydrate("Render Docker Swarm stack intent")],
    generatedAt,
  });
}

describe("renderDockerSwarmRuntimeIntent", () => {
  test("[SWARM-TARGET-RENDER-001][SWARM-TARGET-SECRET-001] renders OCI image intent with masked runtime environment", () => {
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan(),
      environmentSnapshot: runtimeEnvironmentSnapshot(),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_123",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();

    expect(intent.workload).toEqual({
      kind: "image",
      image: "registry.example.com/team/app:sha",
      port: 3000,
    });
    expect(intent.stackName).toBe("appaloft-res-api-dst-prod");
    expect(intent.serviceName).toBe("appaloft-res-api-dst-prod_web");
    expect(intent.labels).toMatchObject({
      "appaloft.managed": "true",
      "appaloft.resource-id": "res_api",
      "appaloft.deployment-id": "dep_123",
      "appaloft.target-id": "dtg_swarm_1",
      "appaloft.destination-id": "dst_prod",
      "appaloft.runtime-target": "docker-swarm",
    });
    expect(intent.health?.http).toMatchObject({
      method: "GET",
      path: "/healthz",
      port: 3000,
      expectedStatusCode: 200,
    });
    expect(intent.routes).toEqual([
      {
        proxyKind: "traefik",
        domains: ["pr-1.example.com"],
        pathPrefix: "/",
        tlsMode: "auto",
        targetPort: 3000,
        routeBehavior: "serve",
        networkName: "appaloft-edge",
      },
    ]);
    expect(intent.environment).toEqual([
      {
        name: "DATABASE_URL",
        exposure: "runtime",
        scope: "environment",
        secret: true,
        valueFrom: "secret:DATABASE_URL",
      },
      {
        name: "PUBLIC_FLAG",
        exposure: "runtime",
        scope: "deployment",
        secret: false,
        value: "enabled",
      },
    ]);
    expect(JSON.stringify(intent)).not.toContain("postgres://secret-value");
  });

  test("[SWARM-TARGET-RENDER-002] renders Compose intent when target service metadata is explicit", () => {
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: composeRuntimePlan({ swarmTargetService: "web" }),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_124",
        targetId: "dtg_swarm_1",
        destinationId: "dst_preview",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().workload).toEqual({
      kind: "compose",
      composeFile: "docker-compose.yml",
      targetServiceName: "web",
    });
  });

  test("[SWARM-TARGET-RENDER-002] rejects Compose intent without an unambiguous target service", () => {
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: composeRuntimePlan(),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_125",
        targetId: "dtg_swarm_1",
        destinationId: "dst_preview",
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("runtime_target_unsupported");
      expect(result.error.details).toEqual(
        expect.objectContaining({
          phase: "runtime-target-render",
          targetKind: "orchestrator-cluster",
          providerKey: "docker-swarm",
          missingCapability: "compose-target-service",
        }),
      );
    }
  });

  test("[SWARM-TARGET-CLEAN-001] renders cleanup selectors scoped to Appaloft Swarm identity labels", () => {
    const plan = renderDockerSwarmCleanupPlan({
      resourceId: "res_api",
      deploymentId: "dep_123",
      targetId: "dtg_swarm_1",
      destinationId: "dst_prod",
    });

    expect(plan.scopeLabels).toEqual({
      "appaloft.managed": "true",
      "appaloft.resource-id": "res_api",
      "appaloft.deployment-id": "dep_123",
      "appaloft.target-id": "dtg_swarm_1",
      "appaloft.destination-id": "dst_prod",
      "appaloft.runtime-target": "docker-swarm",
    });
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]?.command).toContain(
      "--filter 'label=appaloft.deployment-id=dep_123'",
    );
    expect(plan.commands[0]?.command).toContain("--filter 'label=appaloft.resource-id=res_api'");
    expect(plan.commands[0]?.command).toContain("--filter 'label=appaloft.target-id=dtg_swarm_1'");
    expect(plan.commands[0]?.command).toContain(
      "--filter 'label=appaloft.destination-id=dst_prod'",
    );
    expect(plan.commands[0]?.command).toContain(
      "--filter 'label=appaloft.runtime-target=docker-swarm'",
    );
    expect(plan.commands[0]?.command).not.toContain("docker system prune");
    expect(plan.commands[0]?.command).not.toContain("docker volume");
  });
});
