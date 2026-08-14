import { createHash } from "node:crypto";

import {
  deploymentProofConfigurationFingerprint,
  type RequestedDeploymentServiceConfig,
} from "@appaloft/application";

import {
  domainError,
  type DeploymentDependencyBindingReferenceState,
  err,
  ok,
  type EnvironmentConfigSnapshotState,
  type EnvironmentSnapshot,
  type Result,
  type RuntimePlanState,
  StorageDestinationPath,
} from "@appaloft/core";
import { runtimeStorageMountsFromRuntimeMetadata } from "./storage-runtime-mounts";

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
  targetServiceName?: string;
}

export interface KubernetesRuntimeHealthIntent {
  path: string;
  port: number;
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  initialDelaySeconds: number;
}

export interface KubernetesRuntimeResourceBudgetIntent {
  requests?: {
    cpuMillicores?: number;
    memoryMebibytes?: number;
  };
  limits?: {
    cpuMillicores?: number;
    memoryMebibytes?: number;
  };
}

export interface KubernetesRuntimeHorizontalScaleIntent {
  minReplicas: number;
  maxReplicas: number;
  targetCpuUtilizationPercent: number;
}

export interface KubernetesRuntimeScaleIntent {
  replicas: number;
  resources?: KubernetesRuntimeResourceBudgetIntent;
  horizontal?: KubernetesRuntimeHorizontalScaleIntent;
}

export interface KubernetesRuntimeRolloutIntent {
  strategy: "recreate" | "rolling" | "canary";
  maxUnavailable?: number;
  maxSurge?: number;
  canary?: {
    initialTrafficPercent: number;
    stepTrafficPercent: number;
    intervalSeconds: number;
  };
}

export interface KubernetesRuntimeServiceIntent {
  name: string;
  workloadName: string;
  image: string;
  port?: number;
  replicas: number;
  command?: string;
  environment: KubernetesRuntimeEnvironmentIntent[];
}

export interface KubernetesRuntimeStorageIntent {
  attachmentId: string;
  storageVolumeId: string;
  claimName: string;
  mountName: string;
  destinationPath: string;
  readOnly: boolean;
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
  command?: string;
  port: number;
  environment: KubernetesRuntimeEnvironmentIntent[];
  routes: KubernetesRuntimeRouteIntent[];
  health?: KubernetesRuntimeHealthIntent;
  scale: KubernetesRuntimeScaleIntent;
  rollout: KubernetesRuntimeRolloutIntent;
  storageScopeReceipt?: string;
  storage?: KubernetesRuntimeStorageIntent[];
  services?: KubernetesRuntimeServiceIntent[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

function serviceGraphFromMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): RequestedDeploymentServiceConfig[] {
  if (metadata?.["serviceGraph.enabled"] !== "true") return [];
  try {
    const parsed = JSON.parse(metadata["serviceGraph.services"] ?? "[]");
    return Array.isArray(parsed) ? (parsed as RequestedDeploymentServiceConfig[]) : [];
  } catch {
    return [];
  }
}

function serviceWorkloadName(workloadName: string, serviceName: string): string {
  return kubernetesName(`${workloadName}-${serviceName}`, "appaloft-service");
}

function optionalPositiveInteger(
  metadata: Readonly<Record<string, string>> | undefined,
  key: string,
): Result<number | undefined> {
  const raw = metadata?.[key];
  if (raw === undefined) return ok(undefined);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return err(
      domainError.validation("Kubernetes scale profile contains an invalid positive integer", {
        phase: "kubernetes-scale-profile-resolution",
        field: key,
      }),
    );
  }
  return ok(value);
}

function optionalPercentage(
  metadata: Readonly<Record<string, string>> | undefined,
  key: string,
): Result<number | undefined> {
  return optionalPositiveInteger(metadata, key).andThen((value) =>
    value !== undefined && value > 100
      ? err(
          domainError.validation("Kubernetes scale profile percentage exceeds 100", {
            phase: "kubernetes-scale-profile-resolution",
            field: key,
          }),
        )
      : ok(value),
  );
}

function resolveScaleAndRollout(metadata: Readonly<Record<string, string>> | undefined): Result<{
  scale: KubernetesRuntimeScaleIntent;
  rollout: KubernetesRuntimeRolloutIntent;
}> {
  const replicas = optionalPositiveInteger(metadata, "appaloft.scale.replicas");
  if (replicas.isErr()) return err(replicas.error);
  const cpuRequest = optionalPositiveInteger(metadata, "appaloft.scale.cpuRequestMillicores");
  if (cpuRequest.isErr()) return err(cpuRequest.error);
  const cpuLimit = optionalPositiveInteger(metadata, "appaloft.scale.cpuLimitMillicores");
  if (cpuLimit.isErr()) return err(cpuLimit.error);
  const memoryRequest = optionalPositiveInteger(metadata, "appaloft.scale.memoryRequestMebibytes");
  if (memoryRequest.isErr()) return err(memoryRequest.error);
  const memoryLimit = optionalPositiveInteger(metadata, "appaloft.scale.memoryLimitMebibytes");
  if (memoryLimit.isErr()) return err(memoryLimit.error);
  const minReplicas = optionalPositiveInteger(metadata, "appaloft.scale.hpa.minReplicas");
  if (minReplicas.isErr()) return err(minReplicas.error);
  const maxReplicas = optionalPositiveInteger(metadata, "appaloft.scale.hpa.maxReplicas");
  if (maxReplicas.isErr()) return err(maxReplicas.error);
  const targetCpu = optionalPercentage(
    metadata,
    "appaloft.scale.hpa.targetCpuUtilizationPercent",
  );
  if (targetCpu.isErr()) return err(targetCpu.error);

  const horizontalFields = [minReplicas.value, maxReplicas.value, targetCpu.value];
  if (horizontalFields.some((value) => value !== undefined)) {
    if (horizontalFields.some((value) => value === undefined)) {
      return err(
        domainError.validation("Kubernetes horizontal scale profile is incomplete", {
          phase: "kubernetes-scale-profile-resolution",
          reason: "incomplete-horizontal-profile",
        }),
      );
    }
    if ((minReplicas.value ?? 0) > (maxReplicas.value ?? 0)) {
      return err(
        domainError.validation("Kubernetes horizontal scale range is invalid", {
          phase: "kubernetes-scale-profile-resolution",
          reason: "invalid-horizontal-range",
        }),
      );
    }
  }
  if (
    cpuRequest.value !== undefined &&
    cpuLimit.value !== undefined &&
    cpuRequest.value > cpuLimit.value
  ) {
    return err(
      domainError.validation("Kubernetes CPU request exceeds limit", {
        phase: "kubernetes-scale-profile-resolution",
        reason: "cpu-request-exceeds-limit",
      }),
    );
  }
  if (
    memoryRequest.value !== undefined &&
    memoryLimit.value !== undefined &&
    memoryRequest.value > memoryLimit.value
  ) {
    return err(
      domainError.validation("Kubernetes memory request exceeds limit", {
        phase: "kubernetes-scale-profile-resolution",
        reason: "memory-request-exceeds-limit",
      }),
    );
  }

  const strategy = metadata?.["appaloft.rollout.strategy"] ?? "rolling";
  if (strategy !== "recreate" && strategy !== "rolling" && strategy !== "canary") {
    return err(
      domainError.validation("Kubernetes rollout strategy is unsupported", {
        phase: "kubernetes-rollout-profile-resolution",
        strategy,
      }),
    );
  }
  const maxUnavailable = optionalPositiveInteger(
    metadata,
    "appaloft.rollout.maxUnavailable",
  );
  if (maxUnavailable.isErr()) return err(maxUnavailable.error);
  const maxSurge = optionalPositiveInteger(metadata, "appaloft.rollout.maxSurge");
  if (maxSurge.isErr()) return err(maxSurge.error);
  const canaryInitialTraffic = optionalPercentage(
    metadata,
    "appaloft.rollout.canary.initialTrafficPercent",
  );
  if (canaryInitialTraffic.isErr()) return err(canaryInitialTraffic.error);
  const canaryStepTraffic = optionalPercentage(
    metadata,
    "appaloft.rollout.canary.stepTrafficPercent",
  );
  if (canaryStepTraffic.isErr()) return err(canaryStepTraffic.error);
  const canaryInterval = optionalPositiveInteger(
    metadata,
    "appaloft.rollout.canary.intervalSeconds",
  );
  if (canaryInterval.isErr()) return err(canaryInterval.error);
  if (strategy !== "rolling" && (maxUnavailable.value || maxSurge.value)) {
    return err(
      domainError.validation("Rollout surge controls require the rolling strategy", {
        phase: "kubernetes-rollout-profile-resolution",
        strategy,
      }),
    );
  }
  const canaryFields = [
    canaryInitialTraffic.value,
    canaryStepTraffic.value,
    canaryInterval.value,
  ];
  if (strategy === "canary" && canaryFields.some((value) => value === undefined)) {
    return err(
      domainError.validation("Kubernetes canary rollout profile is incomplete", {
        phase: "kubernetes-rollout-profile-resolution",
        reason: "incomplete-canary-profile",
      }),
    );
  }
  if (strategy !== "canary" && canaryFields.some((value) => value !== undefined)) {
    return err(
      domainError.validation("Canary traffic controls require the canary strategy", {
        phase: "kubernetes-rollout-profile-resolution",
        strategy,
      }),
    );
  }
  if (canaryInitialTraffic.value === 100) {
    return err(
      domainError.validation("Kubernetes canary initial traffic must be below 100 percent", {
        phase: "kubernetes-rollout-profile-resolution",
        reason: "invalid-canary-initial-traffic",
      }),
    );
  }

  const hasRequests = cpuRequest.value !== undefined || memoryRequest.value !== undefined;
  const hasLimits = cpuLimit.value !== undefined || memoryLimit.value !== undefined;
  return ok({
    scale: {
      replicas: replicas.value ?? 1,
      ...(hasRequests || hasLimits
        ? {
            resources: {
              ...(hasRequests
                ? {
                    requests: {
                      ...(cpuRequest.value !== undefined
                        ? { cpuMillicores: cpuRequest.value }
                        : {}),
                      ...(memoryRequest.value !== undefined
                        ? { memoryMebibytes: memoryRequest.value }
                        : {}),
                    },
                  }
                : {}),
              ...(hasLimits
                ? {
                    limits: {
                      ...(cpuLimit.value !== undefined
                        ? { cpuMillicores: cpuLimit.value }
                        : {}),
                      ...(memoryLimit.value !== undefined
                        ? { memoryMebibytes: memoryLimit.value }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(minReplicas.value !== undefined &&
      maxReplicas.value !== undefined &&
      targetCpu.value !== undefined
        ? {
            horizontal: {
              minReplicas: minReplicas.value,
              maxReplicas: maxReplicas.value,
              targetCpuUtilizationPercent: targetCpu.value,
            },
          }
        : {}),
    },
    rollout: {
      strategy,
      ...(maxUnavailable.value !== undefined ? { maxUnavailable: maxUnavailable.value } : {}),
      ...(maxSurge.value !== undefined ? { maxSurge: maxSurge.value } : {}),
      ...(strategy === "canary"
        ? {
            canary: {
              initialTrafficPercent: canaryInitialTraffic.value as number,
              stepTrafficPercent: canaryStepTraffic.value as number,
              intervalSeconds: canaryInterval.value as number,
            },
          }
        : {}),
    },
  });
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

function derivedKubernetesName(base: string, purpose: string, fallback: string): string {
  const readable = `${base}-${purpose}`;
  if (readable.length <= 63) return kubernetesName(readable, fallback);
  const suffix = `${purpose}-${digest(readable, 8)}`;
  const prefix = kubernetesName(base, fallback, 63 - suffix.length - 1);
  return `${prefix}-${suffix}`;
}

function namespaceFor(identity: KubernetesRuntimeIdentityInput, stateful: boolean): string {
  const scope = stateful
    ? [
        identity.organizationId,
        identity.projectId,
        identity.environmentId,
        identity.resourceId,
      ].join(":")
    : [
        identity.organizationId,
        identity.projectId,
        identity.environmentId,
        identity.deploymentId,
      ].join(":");
  const readable = kubernetesName(
    stateful
      ? `appaloft-${identity.organizationId}-${identity.projectId}-${identity.environmentId}-${identity.resourceId}`
      : `appaloft-${identity.organizationId}-${identity.projectId}-${identity.environmentId}`,
    "appaloft-runtime",
    52,
  );
  return `${readable}-${digest(scope, 10)}`;
}

function storageScopeReceipt(identity: KubernetesRuntimeIdentityInput): string {
  return digest(
    [
      identity.organizationId,
      identity.projectId,
      identity.environmentId,
      identity.resourceId,
      identity.targetId,
      "storage",
    ].join(":"),
    16,
  );
}

function resolveStorageIntent(
  metadata: Readonly<Record<string, string>> | undefined,
  identity: KubernetesRuntimeIdentityInput,
): Result<KubernetesRuntimeStorageIntent[]> {
  const mounts = runtimeStorageMountsFromRuntimeMetadata(metadata ? { ...metadata } : undefined);
  if (mounts.isErr()) return err(mounts.error);

  const storage: KubernetesRuntimeStorageIntent[] = [];
  for (const mount of mounts.value) {
    if (mount.storageVolumeKind !== "named-volume") {
      return err(
        domainError.runtimeTargetUnsupported(
          "Kubernetes stateful workloads require portable named StorageVolumes",
          {
            phase: "kubernetes-storage-realization",
            storageVolumeId: mount.storageVolumeId,
            missingCapability: "portable-named-storage-volume",
          },
        ),
      );
    }
    const destinationPath = StorageDestinationPath.create(mount.destinationPath);
    if (destinationPath.isErr()) return err(destinationPath.error);
    storage.push({
      attachmentId: mount.attachmentId,
      storageVolumeId: mount.storageVolumeId,
      claimName: kubernetesStorageClaimName(identity.resourceId, mount.storageVolumeId),
      mountName: kubernetesName(
        `storage-${mount.attachmentId}-${digest(mount.storageVolumeId, 6)}`,
        "storage-volume",
      ),
      destinationPath: destinationPath.value.value,
      readOnly: mount.mountMode === "read-only",
    });
  }
  return ok(storage);
}

export function kubernetesStorageClaimName(resourceId: string, storageVolumeId: string): string {
  return kubernetesName(
    `appaloft-${storageVolumeId}-${digest(`${resourceId}:${storageVolumeId}`, 8)}`,
    "appaloft-storage",
  );
}

function workloadNameFor(
  identity: KubernetesRuntimeIdentityInput,
  stateful = false,
): string {
  const identityKey = stateful
    ? `${identity.resourceId}:${identity.targetId}:stateful`
    : `${identity.resourceId}:${identity.deploymentId}`;
  const suffix = digest(identityKey, 8);
  const readable = kubernetesName(
    stateful
      ? `appaloft-${identity.resourceId}`
      : `appaloft-${identity.resourceId}-${identity.deploymentId}`,
    "appaloft-workload",
    54,
  );
  return `${readable}-${suffix}`;
}

function labelValue(value: string): string {
  return kubernetesName(value, "unknown");
}

export function kubernetesStorageVolumeLabelValue(storageVolumeId: string): string {
  return labelValue(storageVolumeId);
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
  const serviceGraph = serviceGraphFromMetadata(execution.metadata);
  const isServiceGraph =
    execution.kind.value === "docker-compose-stack" && serviceGraph.length > 0;
  const isStatelessImage =
    execution.kind.value === "docker-container" &&
    artifact?.kind.value !== "compose-project" &&
    Boolean(image);
  if ((!isStatelessImage || !image) && !isServiceGraph) {
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

  const scaleAndRollout = resolveScaleAndRollout(execution.metadata);
  if (scaleAndRollout.isErr()) return err(scaleAndRollout.error);
  const storage = resolveStorageIntent(execution.metadata, input.identity);
  if (storage.isErr()) return err(storage.error);
  if (storage.value.length > 0 && isServiceGraph) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes storage attachments require one explicit Resource workload",
        {
          phase: "kubernetes-storage-realization",
          missingCapability: "service-specific-storage-attachment",
        },
      ),
    );
  }
  if (
    storage.value.length > 0 &&
    (scaleAndRollout.value.scale.replicas !== 1 ||
      scaleAndRollout.value.scale.horizontal ||
      scaleAndRollout.value.rollout.strategy === "canary")
  ) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes ReadWriteOnce storage requires one replica without HPA or canary rollout",
        {
          phase: "kubernetes-storage-realization",
          missingCapability: "multi-replica-shared-storage",
        },
      ),
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
  const workloadName = workloadNameFor(input.identity, storage.value.length > 0);
  const services = isServiceGraph
    ? serviceGraph
        .map((service): KubernetesRuntimeServiceIntent | undefined => {
          const serviceImage = service.source?.image;
          if (!serviceImage) return undefined;
          const serviceEnvironment: KubernetesRuntimeEnvironmentIntent[] = [
            ...snapshotEnvironment,
            ...Object.entries(service.env ?? {}).map(([name, value]) => ({
              name,
              secret: false,
              value: String(value),
            })),
            ...dependencyEnvironment.filter(
              (variable) => variable.name in (service.secrets ?? {}),
            ),
          ].sort((left, right) => left.name.localeCompare(right.name));
          return {
            name: service.name,
            workloadName: serviceWorkloadName(workloadName, service.name),
            image: serviceImage,
            ...(service.network?.internalPort
              ? { port: service.network.internalPort }
              : {}),
            replicas: service.replicas && service.replicas > 0 ? service.replicas : 1,
            ...(service.runtime?.startCommand
              ? { command: service.runtime.startCommand }
              : {}),
            environment: serviceEnvironment,
          };
        })
        .filter((service): service is KubernetesRuntimeServiceIntent => Boolean(service))
    : undefined;
  if (isServiceGraph && services?.length !== serviceGraph.length) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes service graph requires a prebuilt OCI image for every service",
        {
          phase: "kubernetes-service-graph-resolution",
          missingCapability: "service-image",
        },
      ),
    );
  }
  const routes =
    execution.accessRoutes?.filter((route) => route.proxyKind !== "none").map((route) => ({
      domains: route.domains,
      pathPrefix: route.pathPrefix,
      proxyKind: route.proxyKind,
      tlsMode: route.tlsMode,
      targetPort: route.targetPort ?? port,
      ...(route.targetServiceName ? { targetServiceName: route.targetServiceName } : {}),
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
    namespace: namespaceFor(input.identity, storage.value.length > 0),
    workloadName,
    receipt,
    image: image ?? services?.[0]?.image ?? "",
    ...(execution.startCommand ? { command: execution.startCommand.value } : {}),
    port,
    environment,
    routes,
    ...(health ? { health } : {}),
    scale: scaleAndRollout.value.scale,
    rollout: scaleAndRollout.value.rollout,
    ...(storage.value.length > 0
      ? {
          storageScopeReceipt: storageScopeReceipt(input.identity),
          storage: storage.value,
        }
      : {}),
    ...(services ? { services } : {}),
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
  if (intent.storageScopeReceipt) {
    delete namespaceMetadata.labels["appaloft.io/receipt"];
    namespaceMetadata.labels["appaloft.io/storage-scope-receipt"] =
      intent.storageScopeReceipt;
  }
  const podLabels = {
    ...intent.labels,
    "appaloft.io/workload": intent.workloadName,
  };
  const environmentEntries = (variables: KubernetesRuntimeEnvironmentIntent[]) =>
    variables.map((variable) =>
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
  const containerResources = intent.scale.resources
    ? {
        ...(intent.scale.resources.requests
          ? {
              requests: {
                ...(intent.scale.resources.requests.cpuMillicores !== undefined
                  ? { cpu: `${intent.scale.resources.requests.cpuMillicores}m` }
                  : {}),
                ...(intent.scale.resources.requests.memoryMebibytes !== undefined
                  ? { memory: `${intent.scale.resources.requests.memoryMebibytes}Mi` }
                  : {}),
              },
            }
          : {}),
        ...(intent.scale.resources.limits
          ? {
              limits: {
                ...(intent.scale.resources.limits.cpuMillicores !== undefined
                  ? { cpu: `${intent.scale.resources.limits.cpuMillicores}m` }
                  : {}),
                ...(intent.scale.resources.limits.memoryMebibytes !== undefined
                  ? { memory: `${intent.scale.resources.limits.memoryMebibytes}Mi` }
                  : {}),
              },
            }
          : {}),
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

  for (const storage of intent.storage ?? []) {
    items.push({
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: storage.claimName,
        namespace: intent.namespace,
        labels: {
          "appaloft.io/managed-by": "appaloft",
          "appaloft.io/storage-volume-id": kubernetesStorageVolumeLabelValue(
            storage.storageVolumeId,
          ),
          "appaloft.io/storage-scope-receipt": intent.storageScopeReceipt ?? "unknown",
        },
        annotations: {
          "appaloft.io/storage-volume-id": storage.storageVolumeId,
          "appaloft.io/resource-id": intent.annotations["appaloft.io/resource-id"] ?? "",
        },
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: { requests: { storage: "1Gi" } },
      },
    });
  }

  const workloads =
    intent.services ??
    [
      {
        name: "app",
        workloadName: intent.workloadName,
        image: intent.image,
        ...(intent.command ? { command: intent.command } : {}),
        port: intent.port,
        replicas: intent.scale.replicas,
        environment: intent.environment,
      },
    ];
  for (const workload of workloads) {
    const workloadMetadata = metadata(intent);
    workloadMetadata.name = workload.workloadName;
    workloadMetadata.labels = {
      ...workloadMetadata.labels,
      "appaloft.io/service": labelValue(workload.name),
    };
    const workloadPodLabels: Record<string, string> = {
      ...podLabels,
      "appaloft.io/workload": workload.workloadName,
      "appaloft.io/service": labelValue(workload.name),
    };
    const selector = intent.storageScopeReceipt
      ? {
          "appaloft.io/storage-scope-receipt": intent.storageScopeReceipt,
          "appaloft.io/service": labelValue(workload.name),
        }
      : {
          "appaloft.io/receipt": intent.receipt,
          "appaloft.io/service": labelValue(workload.name),
        };
    if (intent.storageScopeReceipt) {
      workloadPodLabels["appaloft.io/storage-scope-receipt"] = intent.storageScopeReceipt;
    }
    items.push({
      apiVersion: "apps/v1",
      kind: intent.storage?.length ? "StatefulSet" : "Deployment",
      metadata: workloadMetadata,
      spec: {
        replicas: workload.replicas,
        ...(intent.storage?.length ? { serviceName: workload.workloadName } : {}),
        selector: { matchLabels: selector },
        ...(intent.storage?.length
          ? { updateStrategy: { type: "RollingUpdate" } }
          : {
              strategy:
                intent.rollout.strategy === "recreate"
                  ? { type: "Recreate" }
                  : {
                      type: "RollingUpdate",
                      ...(intent.rollout.maxUnavailable !== undefined ||
                      intent.rollout.maxSurge !== undefined
                        ? {
                            rollingUpdate: {
                              ...(intent.rollout.maxUnavailable !== undefined
                                ? { maxUnavailable: intent.rollout.maxUnavailable }
                                : {}),
                              ...(intent.rollout.maxSurge !== undefined
                                ? { maxSurge: intent.rollout.maxSurge }
                                : {}),
                            },
                          }
                        : {}),
                    },
            }),
        template: {
          metadata: { labels: workloadPodLabels, annotations: { ...intent.annotations } },
          spec: {
            serviceAccountName: intent.workloadName,
            automountServiceAccountToken: false,
            containers: [
              {
                name: "app",
                image: workload.image,
                imagePullPolicy: "IfNotPresent",
                ...(workload.port
                  ? { ports: [{ name: "http", containerPort: workload.port }] }
                  : {}),
                env: environmentEntries(workload.environment),
                ...(workload.command ? { command: ["sh", "-lc", workload.command] } : {}),
                ...(containerResources ? { resources: containerResources } : {}),
                ...(intent.storage?.length
                  ? {
                      volumeMounts: intent.storage.map((storage) => ({
                        name: storage.mountName,
                        mountPath: storage.destinationPath,
                        readOnly: storage.readOnly,
                      })),
                    }
                  : {}),
                ...(probe && workload.port
                  ? { readinessProbe: probe, livenessProbe: probe }
                  : {}),
                securityContext: {
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ["ALL"] },
                },
              },
            ],
            ...(intent.storage?.length
              ? {
                  volumes: intent.storage.map((storage) => ({
                    name: storage.mountName,
                    persistentVolumeClaim: { claimName: storage.claimName },
                  })),
                }
              : {}),
          },
        },
      },
    });
    if (workload.port) {
      items.push({
        apiVersion: "v1",
        kind: "Service",
        metadata: workloadMetadata,
        spec: {
          type: "ClusterIP",
          selector,
          ports: [{ name: "http", port: workload.port, targetPort: "http" }],
        },
      });
    }
  }

  if (intent.scale.horizontal) {
    items.push({
      apiVersion: "autoscaling/v2",
      kind: "HorizontalPodAutoscaler",
      metadata: metadata(intent),
      spec: {
        scaleTargetRef: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: intent.workloadName,
        },
        minReplicas: intent.scale.horizontal.minReplicas,
        maxReplicas: intent.scale.horizontal.maxReplicas,
        metrics: [
          {
            type: "Resource",
            resource: {
              name: "cpu",
              target: {
                type: "Utilization",
                averageUtilization: intent.scale.horizontal.targetCpuUtilizationPercent,
              },
            },
          },
        ],
      },
    });
  }

  if (intent.routes.length > 0 && intent.rollout.strategy !== "canary") {
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
                      name:
                        intent.services?.find(
                          (service) => service.name === route.targetServiceName,
                        )?.workloadName ?? intent.services?.[0]?.workloadName ?? intent.workloadName,
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

export function renderKubernetesCanaryRouteManifest(input: {
  intent: KubernetesRuntimeIntent;
  stableNamespace: string;
  stableWorkloadName: string;
  stableEndpointAddresses: readonly string[];
  candidateTrafficPercent: number;
}): Result<KubernetesRuntimeManifest> {
  const { intent } = input;
  if (
    intent.rollout.strategy !== "canary" ||
    !intent.rollout.canary ||
    !intent.health ||
    intent.routes.length === 0 ||
    intent.services !== undefined ||
    intent.routes.some((route) => route.proxyKind !== "traefik")
  ) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes canary routing requires one health-checked Traefik-routed workload",
        {
          phase: "kubernetes-canary-route-render",
          missingCapability: "canary-promotion-proof",
        },
      ),
    );
  }
  if (
    input.stableEndpointAddresses.length === 0 ||
    input.stableEndpointAddresses.some((address) => !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address))
  ) {
    return err(
      domainError.runtimeTargetUnsupported(
        "Kubernetes canary requires ready stable IPv4 endpoints",
        {
          phase: "kubernetes-canary-route-render",
          missingCapability: "stable-runtime-endpoints",
        },
      ),
    );
  }
  if (
    !Number.isInteger(input.candidateTrafficPercent) ||
    input.candidateTrafficPercent <= 0 ||
    input.candidateTrafficPercent > 100
  ) {
    return err(domainError.validation("Kubernetes canary traffic percentage is invalid"));
  }

  const stableAliasName = derivedKubernetesName(
    intent.workloadName,
    "stable",
    "appaloft-stable",
  );
  const weightedServiceName = derivedKubernetesName(
    intent.workloadName,
    "weighted",
    "appaloft-weighted",
  );
  const routePort = intent.routes[0]?.targetPort ?? intent.port;
  const stableWeight = 100 - input.candidateTrafficPercent;
  const canaryMetadata = metadata(intent);
  const items: KubernetesManifestResource[] = [
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: { ...canaryMetadata, name: stableAliasName },
      spec: {
        ports: [{ name: "http", port: routePort, targetPort: routePort }],
      },
    },
    {
      apiVersion: "discovery.k8s.io/v1",
      kind: "EndpointSlice",
      metadata: {
        ...canaryMetadata,
        name: stableAliasName,
        labels: {
          ...canaryMetadata.labels,
          "kubernetes.io/service-name": stableAliasName,
        },
        annotations: {
          ...canaryMetadata.annotations,
          "appaloft.io/stable-namespace": input.stableNamespace,
          "appaloft.io/stable-workload": input.stableWorkloadName,
        },
      },
      addressType: "IPv4",
      endpoints: input.stableEndpointAddresses.map((address) => ({
        addresses: [address],
        conditions: { ready: true },
      })),
      ports: [{ name: "http", protocol: "TCP", port: routePort }],
    },
    {
      apiVersion: "traefik.io/v1alpha1",
      kind: "TraefikService",
      metadata: { ...canaryMetadata, name: weightedServiceName },
      spec: {
        weighted: {
          services: [
            ...(stableWeight > 0
              ? [{ name: stableAliasName, port: routePort, weight: stableWeight }]
              : []),
            {
              name: intent.workloadName,
              port: routePort,
              weight: input.candidateTrafficPercent,
            },
          ],
        },
      },
    },
    {
      apiVersion: "traefik.io/v1alpha1",
      kind: "Middleware",
      metadata: canaryMetadata,
      spec: {
        headers: {
          customResponseHeaders: {
            "X-Appaloft-Deployment-Id": intent.annotations["appaloft.io/deployment-id"],
          },
        },
      },
    },
    {
      apiVersion: "traefik.io/v1alpha1",
      kind: "IngressRoute",
      metadata: canaryMetadata,
      spec: {
        routes: intent.routes.flatMap((route) =>
          route.domains.map((host) => ({
            match: `Host(\`${host}\`) && PathPrefix(\`${route.pathPrefix}\`)`,
            kind: "Rule",
            priority: 10_000,
            services: [{ name: weightedServiceName, kind: "TraefikService" }],
            middlewares: [{ name: intent.workloadName }],
          })),
        ),
        ...(intent.routes.some((route) => route.tlsMode !== "disabled")
          ? { tls: { secretName: `${intent.workloadName}-tls`.slice(0, 63) } }
          : {}),
      },
    },
  ];

  return ok({ apiVersion: "v1", kind: "List", items });
}

export interface KubernetesCleanupPlan {
  namespace: string;
  receipt: string;
  storageScopeReceipt?: string;
  verifyArgs: string[];
  deleteArgs: string[];
  residualArgs?: string[];
}

export function renderKubernetesCleanupPlan(input: {
  namespace: string;
  receipt: string;
  storageScopeReceipt?: string;
}): KubernetesCleanupPlan {
  if (input.storageScopeReceipt) {
    return {
      namespace: input.namespace,
      receipt: input.receipt,
      storageScopeReceipt: input.storageScopeReceipt,
      verifyArgs: ["get", "namespace", input.namespace, "-o", "json"],
      deleteArgs: [
        "delete",
        "all,secret,serviceaccount,networkpolicy,ingress,configmap",
        "--namespace",
        input.namespace,
        "--selector",
        `appaloft.io/receipt=${input.receipt}`,
        "--ignore-not-found=true",
        "--wait=true",
      ],
      residualArgs: [
        "get",
        "all,secret,serviceaccount,networkpolicy,ingress,configmap",
        "--namespace",
        input.namespace,
        "--selector",
        `appaloft.io/receipt=${input.receipt}`,
        "-o",
        "name",
      ],
    };
  }
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
