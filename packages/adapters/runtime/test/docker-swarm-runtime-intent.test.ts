import { describe, expect, test } from "bun:test";
import {
  blueprintComponentRuntimePlanToMetadata,
  type BlueprintComponentRuntimePlan,
} from "@appaloft/blueprints";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  DeploymentDependencyRuntimeSecretRef,
  DeploymentDependencyBindingSnapshotReadinessValue,
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
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  ResourceInstanceKindValue,
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
  renderDockerSwarmApplyPlan,
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

function workerComponentRuntimePlan(): BlueprintComponentRuntimePlan {
  return {
    componentId: "worker",
    serviceName: "worker.internal",
    networkName: "appaloft-blueprint-private",
    dependencyEnv: [],
    dependencyReadinessGates: [],
    injectedEnv: [
      {
        relationId: "worker-uses-api",
        relationType: "endpoint",
        providerComponentId: "api",
        endpoint: "http",
        name: "API_BASE_URL",
        valueFrom: "endpoint-url",
        value: "http://api.internal:3000",
        required: true,
      },
    ],
    serviceDiscovery: [
      {
        relationId: "worker-uses-api",
        providerComponentId: "api",
        serviceName: "api.internal",
        host: "api.internal",
        endpoint: "http",
        port: 3000,
        scheme: "http",
        required: true,
      },
    ],
    networkAllows: [
      {
        relationId: "worker-uses-api",
        providerComponentId: "api",
        mode: "private",
        networkName: "appaloft-blueprint-private",
        required: true,
      },
    ],
    readinessGates: [
      {
        relationId: "worker-starts-after-api",
        providerComponentId: "api",
        providerServiceName: "api.internal",
        kind: "order-after",
        readiness: "healthy",
        required: true,
      },
    ],
    telemetryAttachments: [
      {
        relationId: "worker-traces-to-jaeger",
        providerComponentId: "jaeger",
        providerServiceName: "jaeger.internal",
        signal: "traces",
        endpoint: "otlp-grpc",
        endpointUrl: "grpc://jaeger.internal:4317",
        required: false,
      },
    ],
  };
}

function imageRuntimePlan(metadata?: Record<string, string>): RuntimePlan {
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
      ...(metadata ? { metadata } : {}),
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
    expect(intent.stackName).toBe("appaloft-res-api-dst-prod-dep-123");
    expect(intent.serviceName).toBe("appaloft-res-api-dst-prod-dep-123_web");
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
        pathHandling: "preserve",
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

  test("[DEP-BIND-RUNTIME-INJECT-006] renders dependency runtime secret handles without exposing raw values", () => {
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan(),
      dependencyBindingReferences: [
        {
          bindingId: ResourceBindingId.rehydrate("rbd_pg"),
          dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
          kind: ResourceInstanceKindValue.rehydrate("postgres"),
          targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
          scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
          injectionMode: ResourceInjectionModeValue.rehydrate("env"),
          runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
            "appaloft://dependency-resources/rsi_pg/connection",
          ),
          snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
        },
      ],
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_123",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();

    expect(intent.environment).toContainEqual({
      name: "DATABASE_URL",
      exposure: "runtime",
      scope: "deployment",
      secret: true,
      valueFrom: "secret:appaloft-dep-123-database-url",
    });
    expect(JSON.stringify(intent)).not.toContain("appaloft://dependency-resources");
    expect(JSON.stringify(intent)).not.toContain("postgres://");
  });

  test("[BP-COMP-REL-RUNTIME-002][SWARM-COMP-REL-RUNTIME-001] renders Blueprint component relation runtime effects into Swarm intent", () => {
    const componentRuntime = workerComponentRuntimePlan();
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan(blueprintComponentRuntimePlanToMetadata(componentRuntime)),
      identity: {
        resourceId: "res_worker",
        deploymentId: "dep_worker",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();

    expect(intent.environment).toContainEqual({
      name: "API_BASE_URL",
      exposure: "runtime",
      scope: "component-relation",
      secret: false,
      value: "http://api.internal:3000",
    });
    expect(intent.environment).toContainEqual({
      name: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
      exposure: "runtime",
      scope: "component-relation",
      secret: false,
      value: "grpc://jaeger.internal:4317",
    });
    expect(intent.componentLinks).toEqual([
      {
        relationId: "worker-starts-after-api",
        providerComponentId: "api",
        providerServiceName: "api.internal",
        networkName: "appaloft-blueprint-private",
        required: true,
      },
      {
        relationId: "worker-traces-to-jaeger",
        providerComponentId: "jaeger",
        providerServiceName: "jaeger.internal",
        endpoint: "otlp-grpc",
        networkName: "appaloft-blueprint-private",
        required: false,
      },
      {
        relationId: "worker-uses-api",
        providerComponentId: "api",
        providerServiceName: "api.internal",
        endpoint: "http",
        networkName: "appaloft-blueprint-private",
        required: true,
      },
    ]);
    expect(intent.readinessGates).toEqual([
      {
        relationId: "worker-starts-after-api",
        providerComponentId: "api",
        providerServiceName: "api.internal",
        kind: "order-after",
        readiness: "healthy",
        required: true,
      },
    ]);
    expect(intent.labels).toMatchObject({
      "appaloft.component-id": "worker",
      "appaloft.component-link.worker-uses-api.provider": "api",
      "appaloft.component-link.worker-uses-api.service": "api.internal",
      "appaloft.component-link.worker-uses-api.endpoint": "http",
      "appaloft.component-link.worker-uses-api.network": "appaloft-blueprint-private",
      "appaloft.component-link.worker-starts-after-api.readiness": "healthy",
      "appaloft.component-link.worker-traces-to-jaeger.telemetry": "traces",
    });

    const plan = renderDockerSwarmApplyPlan(intent)._unsafeUnwrap();
    expect(plan.steps.map((step) => step.step)).toEqual([
      "wait-for-component-readiness",
      "create-candidate-service",
      "verify-candidate-service",
      "promote-route-target",
      "cleanup-superseded-services",
    ]);
    expect(plan.steps[0]?.command ?? "").toContain("docker service ps");
    expect(plan.steps[0]?.command ?? "").toContain("api.internal");

    const createCommand = plan.steps[1]?.command ?? "";
    expect(createCommand).toContain("--network 'appaloft-blueprint-private'");
    expect(createCommand).toContain("--network 'appaloft-edge'");
    expect(createCommand).toContain("--env 'API_BASE_URL=http://api.internal:3000'");
    expect(createCommand).toContain(
      "--env 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=grpc://jaeger.internal:4317'",
    );
    expect(createCommand).toContain(
      "--label 'appaloft.component-link.worker-uses-api.provider=api'",
    );
  });

  test("[DEP-RES-REDIS-NATIVE-005] renders realized managed Redis runtime secret handles without exposing raw values", () => {
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan(),
      dependencyBindingReferences: [
        {
          bindingId: ResourceBindingId.rehydrate("rbd_managed_redis"),
          dependencyResourceId: ResourceInstanceId.rehydrate("rsi_managed_redis"),
          kind: ResourceInstanceKindValue.rehydrate("redis"),
          targetName: ResourceBindingTargetName.rehydrate("REDIS_URL"),
          scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
          injectionMode: ResourceInjectionModeValue.rehydrate("env"),
          runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
            "appaloft://dependency-resources/rsi_managed_redis/connection",
          ),
          snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
        },
      ],
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_managed_redis",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();

    expect(intent.environment).toContainEqual({
      name: "REDIS_URL",
      exposure: "runtime",
      scope: "deployment",
      secret: true,
      valueFrom: "secret:appaloft-dep-managed-redis-redis-url",
    });
    expect(JSON.stringify(intent)).not.toContain("appaloft://dependency-resources");
    expect(JSON.stringify(intent)).not.toContain("redis://");
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
    expect(result._unsafeUnwrap().stackName).toBe("appaloft-res-api-dst-preview-dep-124");
  });

  test("[SWARM-TARGET-SECRET-001] keeps registry auth metadata redacted while requiring Swarm registry auth", () => {
    const result = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan({
        swarmRegistryAuthSecretRef: "raw-registry-token-value",
      }),
      environmentSnapshot: runtimeEnvironmentSnapshot(),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_registry",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();

    expect(intent.workload).toMatchObject({
      kind: "image",
      image: "registry.example.com/team/app:sha",
      registryAuth: {
        required: true,
        secretRef: "********",
        redacted: true,
      },
    });
    expect(JSON.stringify(intent)).not.toContain("raw-registry-token-value");
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

  test("[STOR-RUNTIME-001][SWARM-TARGET-APPLY-001] renders storage mounts into Swarm image service create commands", () => {
    const intentResult = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan({
        "storage.mounts": JSON.stringify([
          {
            attachmentId: "rsa_data",
            storageVolumeId: "stv_data",
            storageVolumeKind: "named-volume",
            destinationPath: "/var/lib/app/data",
            mountMode: "read-write",
          },
          {
            attachmentId: "rsa_cache",
            storageVolumeId: "stv_cache",
            storageVolumeKind: "bind-mount",
            sourcePath: "/srv/appaloft/cache",
            destinationPath: "/cache",
            mountMode: "read-only",
          },
        ]),
      }),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_storage",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(intentResult.isOk()).toBe(true);
    const intent = intentResult._unsafeUnwrap();
    expect(intent.mounts).toEqual([
      {
        type: "volume",
        source: "appaloft-stv_data",
        target: "/var/lib/app/data",
        readOnly: false,
      },
      {
        type: "bind",
        source: "/srv/appaloft/cache",
        target: "/cache",
        readOnly: true,
      },
    ]);
    expect(intent.volumeRealizations).toEqual([
      expect.objectContaining({
        storageVolumeId: "stv_data",
        volumeName: "appaloft-stv_data",
        labels: expect.objectContaining({
          "appaloft.managed": "true",
          "appaloft.storage-volume-id": "stv_data",
          "appaloft.storage-runtime-realized-by": "deployment-execution",
        }),
      }),
    ]);

    const plan = renderDockerSwarmApplyPlan(intent)._unsafeUnwrap();
    const createCommand = plan.steps[0]?.command ?? "";
    expect(createCommand).toContain(
      "--mount 'type=volume,source=appaloft-stv_data,target=/var/lib/app/data'",
    );
    expect(createCommand).toContain(
      "--mount 'type=bind,source=/srv/appaloft/cache,target=/cache,readonly'",
    );
  });

  test("[SWARM-TARGET-APPLY-001][SWARM-TARGET-ROUTE-001][SWARM-TARGET-SECRET-001] renders image apply plan as candidate rollout without public host ports", () => {
    const intentResult = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan(),
      environmentSnapshot: runtimeEnvironmentSnapshot(),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_123",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    });

    expect(intentResult.isOk()).toBe(true);
    const intent = intentResult._unsafeUnwrap();
    const result = renderDockerSwarmApplyPlan({
      ...intent,
      environment: intent.environment.map((variable) => ({
        ...variable,
        value: variable.secret ? "postgres://secret-value" : variable.value,
      })),
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.preservesPreviousService).toBe(true);
    expect(plan.steps.map((step) => step.step)).toEqual([
      "create-candidate-service",
      "verify-candidate-service",
      "promote-route-target",
      "cleanup-superseded-services",
    ]);

    const createCommand = plan.steps[0]?.command ?? "";
    const createDisplayCommand = plan.steps[0]?.displayCommand ?? "";
    expect(createCommand).toContain("docker service create");
    expect(createCommand).toContain("--name 'appaloft-res-api-dst-prod-dep-123_web'");
    expect(createCommand).toContain("--network 'appaloft-edge'");
    expect(createCommand).toContain("--label 'appaloft.deployment-id=dep_123'");
    expect(createCommand).toContain("--env 'PUBLIC_FLAG=enabled'");
    expect(createCommand).toContain("--env 'DATABASE_URL=postgres://secret-value'");
    expect(createCommand).toContain("'registry.example.com/team/app:sha'");
    expect(createCommand).not.toContain("--publish");
    expect(createCommand).not.toContain("-p ");
    expect(createCommand).not.toContain("traefik.http.routers");
    expect(createDisplayCommand).toContain("--env 'PUBLIC_FLAG=********'");
    expect(createDisplayCommand).toContain("--env 'DATABASE_URL=********'");
    expect(createDisplayCommand).not.toContain("PUBLIC_FLAG=enabled");
    expect(createDisplayCommand).not.toContain("postgres://secret-value");

    const fixedStringVerificationPlan = renderDockerSwarmApplyPlan({
      ...intent,
      environment: [{ ...intent.environment[0]!, name: "FLAG[0]", value: "present" }],
    })._unsafeUnwrap();
    const fixedStringVerificationCommand =
      fixedStringVerificationPlan.steps[1]?.command ?? "";
    expect(fixedStringVerificationCommand).toContain(
      "sed 's/=.*//' | grep -Fqx -- 'FLAG[0]'",
    );
    expect(fixedStringVerificationCommand).not.toContain("grep -q '^FLAG[0]='");

    const privateRegistryIntent = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan({
        imagePullSecretRef: "raw-private-registry-token",
      }),
      environmentSnapshot: runtimeEnvironmentSnapshot(),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_private_registry",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
    })._unsafeUnwrap();
    const privateRegistryPlan = renderDockerSwarmApplyPlan({
      ...privateRegistryIntent,
      environment: privateRegistryIntent.environment.map((variable) => ({
        ...variable,
        value: variable.secret ? "postgres://secret-value" : variable.value,
      })),
    })._unsafeUnwrap();
    const privateRegistryCreateCommand = privateRegistryPlan.steps[0]?.command ?? "";
    const privateRegistryDisplayCommand = privateRegistryPlan.steps[0]?.displayCommand ?? "";
    expect(privateRegistryCreateCommand).toContain("--with-registry-auth");
    expect(privateRegistryDisplayCommand).toContain("--with-registry-auth");
    expect(privateRegistryCreateCommand).not.toContain("raw-private-registry-token");
    expect(privateRegistryDisplayCommand).not.toContain("raw-private-registry-token");

    const promoteCommand = plan.steps[2]?.command ?? "";
    expect(plan.routeLabels).toContain("traefik.enable=true");
    expect(plan.routeLabels).toContain("traefik.docker.network=appaloft-edge");
    expect(plan.routeLabels).toContain(
      "traefik.http.routers.appaloft-res-api-dst-prod-dep-123-web.rule=Host(`pr-1.example.com`)",
    );
    expect(plan.routeLabels).toContain(
      "traefik.http.routers.appaloft-res-api-dst-prod-dep-123-web.tls.certresolver=appaloft",
    );
    expect(plan.routeLabels).toContain(
      "traefik.http.services.appaloft-res-api-dst-prod-dep-123-web-svc.loadbalancer.server.port=3000",
    );
    expect(promoteCommand).toContain(
      "--label-add 'traefik.http.routers.appaloft-res-api-dst-prod-dep-123-web.rule=Host(`pr-1.example.com`)'",
    );
    expect(promoteCommand).toContain(
      "--label-add 'traefik.http.routers.appaloft-res-api-dst-prod-dep-123-web.tls.certresolver=appaloft'",
    );
    expect(promoteCommand).toContain(
      "--label-add 'traefik.http.services.appaloft-res-api-dst-prod-dep-123-web-svc.loadbalancer.server.port=3000'",
    );

    expect(plan.steps[3]?.command ?? "").toContain("docker service rm");
    expect(plan.steps[3]?.command ?? "").toContain("appaloft.destination-id=dst_prod");
    expect(plan.steps[3]?.command ?? "").toContain("appaloft.runtime-target=docker-swarm");
  });

  test("[RES-ACCESS-DIAG-ROUTE-003][SWARM-TARGET-APPLY-001] renders Traefik access failure middleware for Swarm routes", () => {
    const intent = renderDockerSwarmRuntimeIntent({
      runtimePlan: imageRuntimePlan(),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_123",
        targetId: "dtg_swarm_1",
        destinationId: "dst_prod",
      },
      resourceAccessFailureRenderer: {
        url: "http://host.docker.internal:3001",
      },
    })._unsafeUnwrap();

    const plan = renderDockerSwarmApplyPlan(intent)._unsafeUnwrap();
    const router = "appaloft-res-api-dst-prod-dep-123-web";

    expect(plan.routeLabels).toContain(
      `traefik.http.routers.${router}.middlewares=appaloft-resource-access-errors`,
    );
    expect(plan.routeLabels).toContain(
      "traefik.http.middlewares.appaloft-resource-access-errors.errors.status=404,502,503,504",
    );
    expect(plan.routeLabels).toContain(
      "traefik.http.middlewares.appaloft-resource-access-errors.errors.query=/.appaloft/resource-access-failure?status={status}",
    );
    expect(plan.routeLabels).toContain(
      "traefik.http.services.appaloft-diagnostic-renderer.loadbalancer.server.url=http://host.docker.internal:3001",
    );
    expect(plan.steps[2]?.command ?? "").toContain(
      "--label-add 'traefik.http.routers.appaloft-res-api-dst-prod-dep-123-web.middlewares=appaloft-resource-access-errors'",
    );
  });

  test("[STOR-REALIZE-003][SWARM-TARGET-APPLY-001] renders Compose stack apply plan with storage mounts", () => {
    const intentResult = renderDockerSwarmRuntimeIntent({
      runtimePlan: composeRuntimePlan({
        swarmTargetService: "web",
        "storage.mounts": JSON.stringify([
          {
            attachmentId: "rsa_data",
            storageVolumeId: "stv_data",
            storageVolumeKind: "named-volume",
            destinationPath: "/var/lib/app/data",
            mountMode: "read-write",
          },
        ]),
      }),
      identity: {
        resourceId: "res_api",
        deploymentId: "dep_124",
        targetId: "dtg_swarm_1",
        destinationId: "dst_preview",
      },
    });

    expect(intentResult.isOk()).toBe(true);
    const result = renderDockerSwarmApplyPlan(intentResult._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.steps.map((step) => step.step)).toEqual([
      "deploy-candidate-stack",
      "verify-candidate-service",
      "promote-route-target",
      "cleanup-superseded-services",
    ]);
    const deployCommand = plan.steps[0]?.command ?? "";
    expect(deployCommand).toContain("docker stack deploy");
    expect(deployCommand).toContain("-c 'docker-compose.yml' -c \"$override_file\"");
    expect(deployCommand).toContain("'appaloft-res-api-dst-preview-dep-124'");
    expect(deployCommand).toContain('"appaloft.managed": "true"');
    expect(deployCommand).toContain('"appaloft.deployment-id": "dep_124"');
    expect(deployCommand).toContain('type: "volume"');
    expect(deployCommand).toContain('source: "appaloft-stv_data"');
    expect(deployCommand).toContain('target: "/var/lib/app/data"');
    expect(deployCommand).toContain('"appaloft-stv_data":');
    expect(deployCommand).toContain('"appaloft.storage-volume-id": "stv_data"');
    expect(deployCommand).toContain(
      '"appaloft.storage-runtime-realized-by": "deployment-execution"',
    );
    expect(deployCommand).not.toContain("docker volume prune");
    expect(deployCommand).not.toContain("docker system prune");

    const cleanupCommand = plan.steps[3]?.command ?? "";
    expect(cleanupCommand).toContain("docker stack rm \"$stack_name\"");
    expect(cleanupCommand).toContain("docker service rm \"$service_id\"");
  });
});
