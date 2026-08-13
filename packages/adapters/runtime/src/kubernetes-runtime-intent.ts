import { createHash } from "node:crypto";

import { deploymentProofConfigurationFingerprint } from "@appaloft/application";

import {
  domainError,
  type DeploymentDependencyBindingReferenceState,
  err,
  ok,
  type EnvironmentConfigSnapshotState,
  type EnvironmentSnapshot,
  type Result,
  type RuntimePlanState,
} from "@appaloft/core";

type RuntimePlanLike = { toState(): RuntimePlanState };
type EnvironmentSnapshotLike =
  | EnvironmentSnapshot
  | { toState(): EnvironmentConfigSnapshotState };

export interface KubernetesRuntimeIdentityInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  deploymentId: string;
  targetId: string;
}

export interface KubernetesRuntimeIntentInput {
  runtimePlan: RuntimePlanLike;
  environmentSnapshot?: EnvironmentSnapshotLike;
  dependencyBindingReferences?: readonly DeploymentDependencyBindingReferenceState[];
  identity: KubernetesRuntimeIdentityInput;
}

export interface KubernetesRuntimeEnvironmentIntent {
  name: string;
  secret: boolean;
  value?: string;
  valueFrom?: string;
}

export interface KubernetesRuntimeRouteIntent {
  domains: string[];
  pathPrefix: string;
  proxyKind: string;
  tlsMode: string;
  targetPort: number;
}

export interface KubernetesRuntimeHealthIntent {
  path: string;
  port: number;
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  initialDelaySeconds: number;
}

export interface KubernetesIngressControllerSource {
  namespace: string;
  podSelector: Readonly<Record<string, string>>;
}

export interface KubernetesResolvedRoutingPolicy {
  schemaVersion: "kubernetes.routing-policy/v1";
  ingressControllerSources: readonly KubernetesIngressControllerSource[];
}

export interface KubernetesRuntimeIntent {
  schemaVersion: "kubernetes.runtime-intent/v1";
  namespace: string;
  workloadName: string;
  receipt: string;
  image: string;
  port: number;
  environment: KubernetesRuntimeEnvironmentIntent[];
  routes: KubernetesRuntimeRouteIntent[];
  health?: KubernetesRuntimeHealthIntent;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface KubernetesManifestResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels: Record<string, string>;
    annotations?: Record<string, string>;
  };
  [key: string]: unknown;
}

export interface KubernetesRuntimeManifest {
  apiVersion: "v1";
  kind: "List";
  items: KubernetesManifestResource[];
}

function digest(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function kubernetesName(value: string, fallback: string, maxLength = 63): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = normalized || fallback;
  return safe.length <= maxLength
    ? safe
    : safe.slice(0, maxLength).replace(/-+$/g, "") || fallback;
}

function namespaceFor(identity: KubernetesRuntimeIdentityInput): string {
  const scope = [
    identity.organizationId,
    identity.projectId,
    identity.environmentId,
    identity.deploymentId,
  ].join(":");
  const readable = kubernetesName(
    `appaloft-${identity.organizationId}-${identity.projectId}-${identity.environmentId}`,
    "appaloft-runtime",
    52,
  );
  return `${readable}-${digest(scope, 10)}`;
}

function workloadNameFor(identity: KubernetesRuntimeIdentityInput): string {
  const suffix = digest(`${identity.resourceId}:${identity.deploymentId}`, 8);
  const readable = kubernetesName(
    `appaloft-${identity.resourceId}-${identity.deploymentId}`,
    "appaloft-workload",
    54,
  );
  return `${readable}-${suffix}`;
}

function labelValue(value: string): string {
  return kubernetesName(value, "unknown");
}

function identityLabels(
  identity: KubernetesRuntimeIdentityInput,
  receipt: string,
): Record<string, string> {
  return {
    "appaloft.io/managed-by": "appaloft",
    "appaloft.io/receipt": receipt,
    "appaloft.io/organization-id": labelValue(identity.organizationId),
    "appaloft.io/project-id": labelValue(identity.projectId),
    "appaloft.io/environment-id": labelValue(identity.environmentId),
    "appaloft.io/resource-id": labelValue(identity.resourceId),
    "appaloft.io/deployment-id": labelValue(identity.deploymentId),
    "appaloft.io/target-id": labelValue(identity.targetId),
  };
}

function identityAnnotations(identity: KubernetesRuntimeIdentityInput): Record<string, string> {
  return {
    "appaloft.io/organization-id": identity.organizationId,
    "appaloft.io/project-id": identity.projectId,
    "appaloft.io/environment-id": identity.environmentId,
    "appaloft.io/resource-id": identity.resourceId,
    "appaloft.io/deployment-id": identity.deploymentId,
    "appaloft.io/target-id": identity.targetId,
  };
}

export function renderKubernetesRuntimeIntent(
  input: KubernetesRuntimeIntentInput,
): Result<KubernetesRuntimeIntent> {
  const runtimePlan = input.runtimePlan.toState();
  const execution = runtimePlan.execution.toState();
  const artifact = runtimePlan.runtimeArtifact?.toState();
  const image = artifact?.image?.value ?? execution.image?.value;
  const isStatelessImage =
    execution.kind.value === "docker-container" &&
    artifact?.kind.value !== "compose-project" &&
    Boolean(image);
  if (!isStatelessImage || !image) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes R5a requires a stateless prebuilt OCI image",
        {
          phase: "kubernetes-runtime-target-render",
          providerKey: "kubernetes",
          targetKind: "orchestrator-cluster",
          missingCapability: "stateless-oci-image",
        },
      ),
    );
  }

  const port = execution.port?.value;
  if (!port) {
    return err(
      domainError.runtimeTargetUnsupported("Kubernetes R5a requires a declared container port", {
        phase: "kubernetes-runtime-target-render",
        providerKey: "kubernetes",
        targetKind: "orchestrator-cluster",
        missingCapability: "container-port",
      }),
    );
  }

  const environmentState = input.environmentSnapshot?.toState();
  const snapshotEnvironment =
    environmentState?.variables
      .filter((variable) => variable.exposure.value === "runtime")
      .map((variable) => ({
        name: variable.key.value,
        secret: variable.isSecret,
        ...(variable.isSecret
          ? { valueFrom: `secret:${variable.key.value}` }
          : { value: variable.value.value }),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)) ?? [];
  const dependencyEnvironment = (input.dependencyBindingReferences ?? [])
    .filter(
      (reference) =>
        reference.runtimeSecretRef &&
        reference.snapshotReadiness.isReady() &&
        reference.scope.value === "runtime-only" &&
        reference.injectionMode.value === "env",
    )
    .map((reference) => ({
      name: reference.targetName.value,
      secret: true,
      valueFrom: `secret:${reference.targetName.value}`,
    }));
  const environment = [...snapshotEnvironment, ...dependencyEnvironment].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const routes =
    execution.accessRoutes?.filter((route) => route.proxyKind !== "none").map((route) => ({
      domains: route.domains,
      pathPrefix: route.pathPrefix,
      proxyKind: route.proxyKind,
      tlsMode: route.tlsMode,
      targetPort: route.targetPort ?? port,
    })) ?? [];
  const httpHealth = execution.healthCheck?.http;
  const health =
    execution.healthCheck?.enabled && httpHealth
      ? {
          path: httpHealth.path.value,
          port: httpHealth.port?.value ?? port,
          periodSeconds: execution.healthCheck.intervalSeconds.value,
          timeoutSeconds: execution.healthCheck.timeoutSeconds.value,
          failureThreshold: execution.healthCheck.retries.value,
          initialDelaySeconds: execution.healthCheck.startPeriodSeconds.value,
        }
      : undefined;
  const receipt = digest(
    [
      input.identity.organizationId,
      input.identity.projectId,
      input.identity.environmentId,
      input.identity.resourceId,
      input.identity.deploymentId,
      input.identity.targetId,
    ].join(":"),
    16,
  );

  const annotations = identityAnnotations(input.identity);
  if (environmentState) {
    annotations["appaloft.io/configuration-fingerprint"] =
      deploymentProofConfigurationFingerprint(
        environmentState.variables.map((variable) => ({
          key: variable.key.value,
          value: variable.value.value,
          kind: variable.kind.value,
          exposure: variable.exposure.value,
          scope: variable.scope.value,
          isSecret: variable.isSecret,
        })),
      );
  }

  return ok({
    schemaVersion: "kubernetes.runtime-intent/v1",
    namespace: namespaceFor(input.identity),
    workloadName: workloadNameFor(input.identity),
    receipt,
    image,
    port,
    environment,
    routes,
    ...(health ? { health } : {}),
    labels: identityLabels(input.identity, receipt),
    annotations,
  });
}

function metadata(
  intent: KubernetesRuntimeIntent,
  namespaced = true,
): KubernetesManifestResource["metadata"] {
  return {
    name: intent.workloadName,
    ...(namespaced ? { namespace: intent.namespace } : {}),
    labels: { ...intent.labels },
    annotations: { ...intent.annotations },
  };
}

export function renderKubernetesRuntimeManifest(
  intent: KubernetesRuntimeIntent,
  secretValues: Readonly<Record<string, string>> = {},
  routingPolicy?: KubernetesResolvedRoutingPolicy,
): Result<KubernetesRuntimeManifest> {
  const secretNames = intent.environment
    .filter((variable) => variable.secret)
    .map((variable) => variable.name);
  const missingSecrets = secretNames.filter(
    (name) => typeof secretValues[name] !== "string",
  );
  if (missingSecrets.length > 0) {
    return err(
      domainError.infra("Kubernetes environment secret materialization is incomplete", {
        phase: "kubernetes-secret-materialization",
        missingSecretCount: missingSecrets.length,
      }),
    );
  }

  if (intent.routes.length > 0 && !routingPolicy) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes routed workloads require an explicitly resolved routing policy",
        {
          phase: "kubernetes-routing-policy-resolution",
          reason: "routing-policy-reference-required",
        },
      ),
    );
  }

  const namespaceMetadata = metadata(intent, false);
  namespaceMetadata.name = intent.namespace;
  const podLabels = {
    ...intent.labels,
    "appaloft.io/workload": intent.workloadName,
  };
  const env = intent.environment.map((variable) =>
    variable.secret
      ? {
          name: variable.name,
          valueFrom: {
            secretKeyRef: { name: intent.workloadName, key: variable.name },
          },
        }
      : { name: variable.name, value: variable.value ?? "" },
  );
  const probe = intent.health
    ? {
        httpGet: { path: intent.health.path, port: intent.health.port },
        periodSeconds: intent.health.periodSeconds,
        timeoutSeconds: intent.health.timeoutSeconds,
        failureThreshold: intent.health.failureThreshold,
        initialDelaySeconds: intent.health.initialDelaySeconds,
      }
    : undefined;
  const items: KubernetesManifestResource[] = [
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: namespaceMetadata,
    },
    {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: metadata(intent),
      automountServiceAccountToken: false,
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: metadata(intent),
      spec: {
        podSelector: { matchLabels: { "appaloft.io/receipt": intent.receipt } },
        policyTypes: ["Ingress", "Egress"],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": intent.namespace },
                },
              },
              ...(routingPolicy?.ingressControllerSources.map((source) => ({
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": source.namespace },
                },
                podSelector: { matchLabels: { ...source.podSelector } },
              })) ?? []),
            ],
          },
        ],
        egress: [{}],
      },
    },
  ];

  if (secretNames.length > 0) {
    items.push({
      apiVersion: "v1",
      kind: "Secret",
      metadata: metadata(intent),
      type: "Opaque",
      data: Object.fromEntries(
        secretNames.map((name) => [name, Buffer.from(secretValues[name] ?? "").toString("base64")]),
      ),
    });
  }

  items.push(
    {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: metadata(intent),
      spec: {
        replicas: 1,
        selector: { matchLabels: { "appaloft.io/receipt": intent.receipt } },
        strategy: { type: "RollingUpdate" },
        template: {
          metadata: { labels: podLabels, annotations: { ...intent.annotations } },
          spec: {
            serviceAccountName: intent.workloadName,
            automountServiceAccountToken: false,
            containers: [
              {
                name: "app",
                image: intent.image,
                imagePullPolicy: "IfNotPresent",
                ports: [{ name: "http", containerPort: intent.port }],
                env,
                ...(probe ? { readinessProbe: probe, livenessProbe: probe } : {}),
                securityContext: {
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ["ALL"] },
                },
              },
            ],
          },
        },
      },
    },
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: metadata(intent),
      spec: {
        type: "ClusterIP",
        selector: { "appaloft.io/receipt": intent.receipt },
        ports: [{ name: "http", port: intent.port, targetPort: "http" }],
      },
    },
  );

  if (intent.routes.length > 0) {
    const traefikRoutes = intent.routes.filter((route) => route.proxyKind === "traefik");
    if (traefikRoutes.length > 0) {
      items.push({
        apiVersion: "traefik.io/v1alpha1",
        kind: "Middleware",
        metadata: metadata(intent),
        spec: {
          headers: {
            customResponseHeaders: {
              "X-Appaloft-Deployment-Id":
                intent.annotations["appaloft.io/deployment-id"],
            },
          },
        },
      });
    }
    items.push({
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        ...metadata(intent),
        annotations: {
          ...intent.annotations,
          "appaloft.io/tls-mode": intent.routes[0]?.tlsMode ?? "disabled",
          ...(traefikRoutes.length > 0
            ? {
                "traefik.ingress.kubernetes.io/router.middlewares":
                  `${intent.namespace}-${intent.workloadName}@kubernetescrd`,
              }
            : {}),
        },
      },
      spec: {
        rules: intent.routes.flatMap((route) =>
          route.domains.map((host) => ({
            host,
            http: {
              paths: [
                {
                  path: route.pathPrefix,
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: intent.workloadName,
                      port: { number: route.targetPort },
                    },
                  },
                },
              ],
            },
          })),
        ),
        tls: intent.routes
          .filter((route) => route.tlsMode !== "disabled")
          .map((route) => ({
            hosts: [...route.domains],
            secretName: `${intent.workloadName}-tls`.slice(0, 63),
          })),
      },
    });
  }

  return ok({ apiVersion: "v1", kind: "List", items });
}

export interface KubernetesCleanupPlan {
  namespace: string;
  receipt: string;
  verifyArgs: string[];
  deleteArgs: string[];
}

export function renderKubernetesCleanupPlan(input: {
  namespace: string;
  receipt: string;
}): KubernetesCleanupPlan {
  return {
    namespace: input.namespace,
    receipt: input.receipt,
    verifyArgs: ["get", "namespace", input.namespace, "-o", "json"],
    deleteArgs: [
      "delete",
      "namespace",
      input.namespace,
      "--ignore-not-found=true",
      "--wait=true",
    ],
  };
}
