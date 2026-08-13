import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  DeploymentDependencyBindingSnapshotReadinessValue,
  DeploymentDependencyRuntimeSecretRef,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
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
  ProviderKey,
  PublicDomainName,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  ResourceInstanceKindValue,
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
  renderKubernetesCanaryRouteManifest,
  renderKubernetesRuntimeIntent,
  renderKubernetesRuntimeManifest,
  type KubernetesResolvedRoutingPolicy,
} from "../src/kubernetes-runtime-intent";

const generatedAt = GeneratedAt.rehydrate("2026-08-13T00:00:00.000Z");
const routingPolicy: KubernetesResolvedRoutingPolicy = {
  schemaVersion: "kubernetes.routing-policy/v1",
  ingressControllerSources: [
    {
      namespace: "kube-system",
      podSelector: { "app.kubernetes.io/name": "traefik" },
    },
  ],
};

function runtimePlan(): RuntimePlan {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_kubernetes_image"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("remote-git"),
      locator: SourceLocator.rehydrate("https://github.com/acme/app.git"),
      displayName: DisplayNameText.rehydrate("Acme App"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image: ImageReference.rehydrate("registry.example.com/team/app:sha"),
      port: PortNumber.rehydrate(3000),
      accessRoutes: [
        AccessRoute.rehydrate({
          proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
          domains: [PublicDomainName.rehydrate("app.example.test")],
          pathPrefix: RoutePathPrefix.rehydrate("/"),
          tlsMode: TlsModeValue.rehydrate("auto"),
          targetPort: PortNumber.rehydrate(3000),
        }),
      ],
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
      providerKey: ProviderKey.rehydrate("kubernetes"),
      serverIds: [DeploymentTargetId.rehydrate("srv_r5a_cluster")],
    }),
    detectSummary: DetectSummary.rehydrate("Prebuilt OCI image"),
    steps: [PlanStepText.rehydrate("Render Kubernetes runtime intent")],
    generatedAt,
  });
}

function scaledRuntimePlan(): RuntimePlan {
  const state = runtimePlan().toState();
  return RuntimePlan.rehydrate({
    ...state,
    execution: RuntimeExecutionPlan.rehydrate({
      ...state.execution.toState(),
      metadata: {
        "appaloft.scale.replicas": "3",
        "appaloft.scale.cpuRequestMillicores": "250",
        "appaloft.scale.cpuLimitMillicores": "1000",
        "appaloft.scale.memoryRequestMebibytes": "256",
        "appaloft.scale.memoryLimitMebibytes": "512",
        "appaloft.scale.hpa.minReplicas": "2",
        "appaloft.scale.hpa.maxReplicas": "8",
        "appaloft.scale.hpa.targetCpuUtilizationPercent": "70",
        "appaloft.rollout.strategy": "rolling",
        "appaloft.rollout.maxUnavailable": "1",
        "appaloft.rollout.maxSurge": "2",
      },
    }),
  });
}

function serviceGraphRuntimePlan(): RuntimePlan {
  const state = runtimePlan().toState();
  return RuntimePlan.rehydrate({
    ...state,
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
      port: PortNumber.rehydrate(3000),
      accessRoutes: state.execution.accessRoutes,
      metadata: {
        "serviceGraph.enabled": "true",
        "serviceGraph.services": JSON.stringify([
          {
            name: "api",
            kind: "api",
            source: { type: "image", image: "registry.example.com/team/api:sha" },
            network: { internalPort: 3000, exposureMode: "reverse-proxy" },
            replicas: 2,
            env: { SERVICE_ROLE: "api" },
            secrets: { DATABASE_URL: { from: "postgres.connection" } },
          },
          {
            name: "worker",
            kind: "worker",
            source: { type: "image", image: "registry.example.com/team/worker:sha" },
            runtime: { startCommand: "bun run worker" },
            env: { API_URL: "http://api:3000" },
          },
        ]),
      },
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
    }),
  });
}

function environmentSnapshot(): EnvironmentConfigSnapshot {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate("envsnap_kubernetes"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    createdAt: generatedAt,
    precedence: [ConfigScopeValue.rehydrate("environment")],
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

describe("Kubernetes runtime intent", () => {
  test("[K8S-COMPOSE-012] translates an image-backed service graph with private services and dependency secrets", () => {
    const intent = renderKubernetesRuntimeIntent({
      runtimePlan: serviceGraphRuntimePlan(),
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
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_platform",
        deploymentId: "dep_graph_1",
        targetId: "srv_r5b_cluster",
      },
    })._unsafeUnwrap();

    expect(intent.services).toEqual([
      expect.objectContaining({
        name: "api",
        image: "registry.example.com/team/api:sha",
        port: 3000,
        replicas: 2,
      }),
      expect.objectContaining({
        name: "worker",
        image: "registry.example.com/team/worker:sha",
        command: "bun run worker",
      }),
    ]);
    const manifest = renderKubernetesRuntimeManifest(
      intent,
      { DATABASE_URL: "postgres://runtime-secret" },
      routingPolicy,
    )._unsafeUnwrap();
    expect(
      manifest.items
        .filter((item) => item.kind === "Deployment")
        .map((item) => item.metadata.name),
    ).toEqual([`${intent.workloadName}-api`, `${intent.workloadName}-worker`]);
    expect(
      manifest.items
        .filter((item) => item.kind === "Service")
        .map((item) => item.metadata.name),
    ).toEqual([`${intent.workloadName}-api`]);
    expect(JSON.stringify(manifest)).toContain("http://api:3000");
    expect(JSON.stringify(manifest)).not.toContain("postgres://runtime-secret");
  });

  test("[SCALE-PROFILE-009][ROLLOUT-PROFILE-011] renders portable scale and rolling policy", () => {
    const intent = renderKubernetesRuntimeIntent({
      runtimePlan: scaledRuntimePlan(),
      identity: {
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_scaled_1",
        targetId: "srv_r5b_cluster",
      },
    })._unsafeUnwrap();

    expect(intent.scale).toEqual({
      replicas: 3,
      resources: {
        requests: { cpuMillicores: 250, memoryMebibytes: 256 },
        limits: { cpuMillicores: 1000, memoryMebibytes: 512 },
      },
      horizontal: {
        minReplicas: 2,
        maxReplicas: 8,
        targetCpuUtilizationPercent: 70,
      },
    });
    expect(intent.rollout).toEqual({ strategy: "rolling", maxUnavailable: 1, maxSurge: 2 });

    const manifest = renderKubernetesRuntimeManifest(intent, {}, routingPolicy)._unsafeUnwrap();
    const deployment = manifest.items.find((item) => item.kind === "Deployment");
    expect(deployment?.spec).toMatchObject({
      replicas: 3,
      strategy: {
        type: "RollingUpdate",
        rollingUpdate: { maxUnavailable: 1, maxSurge: 2 },
      },
      template: {
        spec: {
          containers: [
            {
              resources: {
                requests: { cpu: "250m", memory: "256Mi" },
                limits: { cpu: "1000m", memory: "512Mi" },
              },
            },
          ],
        },
      },
    });
    expect(manifest.items.find((item) => item.kind === "HorizontalPodAutoscaler")?.spec).toMatchObject({
      minReplicas: 2,
      maxReplicas: 8,
      metrics: [
        {
          type: "Resource",
          resource: {
            name: "cpu",
            target: { type: "Utilization", averageUtilization: 70 },
          },
        },
      ],
    });
  });

  test("[SCALE-PROFILE-009] rejects invalid scale policy before manifest mutation", () => {
    const state = scaledRuntimePlan().toState();
    const invalid = RuntimePlan.rehydrate({
      ...state,
      execution: RuntimeExecutionPlan.rehydrate({
        ...state.execution.toState(),
        metadata: {
          ...state.execution.metadata,
          "appaloft.scale.hpa.minReplicas": "9",
          "appaloft.scale.hpa.maxReplicas": "3",
        },
      }),
    });

    const result = renderKubernetesRuntimeIntent({
      runtimePlan: invalid,
      identity: {
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_invalid_scale",
        targetId: "srv_r5b_cluster",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-scale-profile-resolution",
      reason: "invalid-horizontal-range",
    });
  });

  test("[ROLLOUT-PROFILE-011] renders staged canary routing without replacing the stable route", () => {
    const state = runtimePlan().toState();
    const canary = RuntimePlan.rehydrate({
      ...state,
      execution: RuntimeExecutionPlan.rehydrate({
        ...state.execution.toState(),
        metadata: {
          "appaloft.rollout.strategy": "canary",
          "appaloft.rollout.canary.initialTrafficPercent": "10",
          "appaloft.rollout.canary.stepTrafficPercent": "30",
          "appaloft.rollout.canary.intervalSeconds": "60",
        },
      }),
    });
    const intent = renderKubernetesRuntimeIntent({
      runtimePlan: canary,
      identity: {
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_canary_1",
        targetId: "srv_r5b_cluster",
      },
    })._unsafeUnwrap();
    const baseManifest = renderKubernetesRuntimeManifest(intent, {}, routingPolicy)._unsafeUnwrap();
    const routeManifest = renderKubernetesCanaryRouteManifest({
      intent,
      stableNamespace: "appaloft-stable",
      stableWorkloadName: "appaloft-api-stable",
      stableEndpointAddresses: ["10.42.0.10"],
      candidateTrafficPercent: 10,
    })._unsafeUnwrap();

    expect(intent.rollout).toEqual({
      strategy: "canary",
      canary: {
        initialTrafficPercent: 10,
        stepTrafficPercent: 30,
        intervalSeconds: 60,
      },
    });
    expect(baseManifest.items.some((item) => item.kind === "Ingress")).toBe(false);
    expect(routeManifest.items.find((item) => item.kind === "Service")?.spec).toEqual({
      ports: [{ name: "http", port: 3000, targetPort: 3000 }],
    });
    expect(routeManifest.items.find((item) => item.kind === "EndpointSlice")).toMatchObject({
      addressType: "IPv4",
      endpoints: [{ addresses: ["10.42.0.10"], conditions: { ready: true } }],
    });
    expect(routeManifest.items.find((item) => item.kind === "TraefikService")?.spec).toEqual({
      weighted: {
        services: [
          expect.objectContaining({ weight: 90 }),
          expect.objectContaining({ weight: 10 }),
        ],
      },
    });
    expect(routeManifest.items.find((item) => item.kind === "IngressRoute")).toBeDefined();

    const longWorkloadName = `appaloft-${"resource".repeat(7)}`.slice(0, 63);
    const longNameRoute = renderKubernetesCanaryRouteManifest({
      intent: { ...intent, workloadName: longWorkloadName },
      stableNamespace: "appaloft-stable",
      stableWorkloadName: longWorkloadName,
      stableEndpointAddresses: ["10.42.0.10"],
      candidateTrafficPercent: 10,
    })._unsafeUnwrap();
    const routedNames = longNameRoute.items
      .filter((item) => item.kind === "Service" || item.kind === "TraefikService")
      .map((item) => item.metadata.name);
    expect(new Set([longWorkloadName, ...routedNames]).size).toBe(3);
    expect(routedNames.every((name) => name.length <= 63)).toBe(true);
  });

  test("[K8S-OCI-004][K8S-ISO-006] renders a fenced stateless OCI realization", () => {
    const intent = renderKubernetesRuntimeIntent({
      runtimePlan: runtimePlan(),
      environmentSnapshot: environmentSnapshot(),
      identity: {
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_candidate_1",
        targetId: "srv_r5a_cluster",
      },
    })._unsafeUnwrap();

    expect(intent).toMatchObject({
      schemaVersion: "kubernetes.runtime-intent/v1",
      image: "registry.example.com/team/app:sha",
      port: 3000,
      routes: [
        {
          domains: ["app.example.test"],
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
        },
      ],
      labels: {
        "appaloft.io/managed-by": "appaloft",
        "appaloft.io/deployment-id": "dep-candidate-1",
        "appaloft.io/project-id": "prj-shop",
        "appaloft.io/environment-id": "env-prod",
      },
    });
    expect(intent.namespace).toMatch(/^appaloft-org-acme-prj-shop-env-prod-[a-f0-9]{10}$/);
    expect(intent.receipt).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(intent)).not.toContain("postgres://secret-value");

    const manifest = renderKubernetesRuntimeManifest(intent, {
      DATABASE_URL: "postgres://secret-value",
    }, routingPolicy)._unsafeUnwrap();
    const resources = manifest.items.map((item) => `${item.kind}/${item.metadata.name}`);
    expect(resources).toEqual([
      `Namespace/${intent.namespace}`,
      `ServiceAccount/${intent.workloadName}`,
      `NetworkPolicy/${intent.workloadName}`,
      `Secret/${intent.workloadName}`,
      `Deployment/${intent.workloadName}`,
      `Service/${intent.workloadName}`,
      `Middleware/${intent.workloadName}`,
      `Ingress/${intent.workloadName}`,
    ]);
    expect(JSON.stringify(manifest)).not.toContain("postgres://secret-value");
    expect(manifest.items.every((item) => item.metadata.labels["appaloft.io/receipt"] === intent.receipt)).toBe(true);
    expect(
      manifest.items.find((item) => item.kind === "NetworkPolicy")?.spec,
    ).toMatchObject({
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": intent.namespace },
              },
            },
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
              },
              podSelector: {
                matchLabels: { "app.kubernetes.io/name": "traefik" },
              },
            },
          ],
        },
      ],
    });
  });

  test("[K8S-ISO-006] routed manifests fail closed without an exact routing policy", () => {
    const intent = renderKubernetesRuntimeIntent({
      runtimePlan: runtimePlan(),
      identity: {
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_candidate_1",
        targetId: "srv_r5a_cluster",
      },
    })._unsafeUnwrap();

    const result = renderKubernetesRuntimeManifest(intent);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-routing-policy-resolution",
      reason: "routing-policy-reference-required",
    });
  });

  test("[K8S-ADM-003] rejects Compose and missing image before manifest apply", () => {
    const state = runtimePlan().toState();
    const unsupported = RuntimePlan.rehydrate({
      ...state,
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
      }),
      runtimeArtifact: undefined,
    });

    const result = renderKubernetesRuntimeIntent({
      runtimePlan: unsupported,
      identity: {
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_candidate_1",
        targetId: "srv_r5a_cluster",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-runtime-target-render",
      missingCapability: "stateless-oci-image",
    });
  });

  test("[K8S-OCI-004] materializes ready dependency bindings through a namespaced Secret", () => {
    const intent = renderKubernetesRuntimeIntent({
      runtimePlan: runtimePlan(),
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
        organizationId: "org_acme",
        projectId: "prj_shop",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_candidate_1",
        targetId: "srv_r5a_cluster",
      },
    })._unsafeUnwrap();

    expect(intent.environment).toEqual([
      {
        name: "DATABASE_URL",
        secret: true,
        valueFrom: "secret:DATABASE_URL",
      },
    ]);
    const manifest = renderKubernetesRuntimeManifest(intent, {
      DATABASE_URL: "postgres://runtime-secret",
    }, routingPolicy)._unsafeUnwrap();
    expect(JSON.stringify(manifest)).not.toContain("postgres://runtime-secret");
    expect(
      manifest.items.find((item) => item.kind === "Secret")?.metadata.namespace,
    ).toBe(intent.namespace);
  });
});
