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
