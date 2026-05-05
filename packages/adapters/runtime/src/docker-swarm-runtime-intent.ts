import {
  domainError,
  err,
  ok,
  type EnvironmentConfigSnapshotState,
  type EnvironmentSnapshot,
  type RuntimeExecutionPlanState,
  type RuntimeHealthCheckPolicyState,
  type RuntimePlanState,
  type Result,
} from "@appaloft/core";

type RuntimePlanLike = {
  toState(): RuntimePlanState;
};

type EnvironmentSnapshotLike = EnvironmentSnapshot | { toState(): EnvironmentConfigSnapshotState };

export interface DockerSwarmRuntimeIdentityInput {
  resourceId: string;
  deploymentId: string;
  targetId: string;
  destinationId: string;
}

export interface DockerSwarmRuntimeIntentInput {
  runtimePlan: RuntimePlanLike;
  environmentSnapshot?: EnvironmentSnapshotLike;
  identity: DockerSwarmRuntimeIdentityInput;
  edgeNetworkName?: string;
}

export interface DockerSwarmImageWorkloadIntent {
  kind: "image";
  image: string;
  port?: number;
}

export interface DockerSwarmComposeWorkloadIntent {
  kind: "compose";
  composeFile: string;
  targetServiceName: string;
}

export type DockerSwarmWorkloadIntent =
  | DockerSwarmImageWorkloadIntent
  | DockerSwarmComposeWorkloadIntent;

export interface DockerSwarmEnvironmentVariableIntent {
  name: string;
  exposure: string;
  scope: string;
  secret: boolean;
  value?: string;
  valueFrom?: string;
}

export interface DockerSwarmRouteIntent {
  proxyKind: string;
  domains: string[];
  pathPrefix: string;
  tlsMode: string;
  targetPort?: number;
  routeBehavior: "serve" | "redirect";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  networkName: string;
}

export interface DockerSwarmHealthIntent {
  enabled: boolean;
  type: "http" | "command";
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  startPeriodSeconds: number;
  http?: {
    method: string;
    scheme: string;
    host: string;
    port?: number;
    path: string;
    expectedStatusCode: number;
    expectedResponseText?: string;
  };
  command?: {
    redacted: true;
  };
}

export interface DockerSwarmRuntimeIntent {
  schemaVersion: "docker-swarm.runtime-intent/v1";
  stackName: string;
  serviceName: string;
  targetServiceName: string;
  workload: DockerSwarmWorkloadIntent;
  environment: DockerSwarmEnvironmentVariableIntent[];
  health?: DockerSwarmHealthIntent;
  routes: DockerSwarmRouteIntent[];
  labels: Record<string, string>;
  warnings: string[];
}

const defaultEdgeNetworkName = "appaloft-edge";
const composeTargetServiceMetadataKeys = [
  "swarmTargetService",
  "composeTargetService",
  "targetServiceName",
] as const;

function sanitizeDockerName(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safe = normalized || fallback;
  return safe.length <= 63 ? safe : safe.slice(0, 63).replace(/-+$/g, "") || fallback;
}

function renderStackName(identity: DockerSwarmRuntimeIdentityInput): string {
  return sanitizeDockerName(
    `appaloft-${identity.resourceId}-${identity.destinationId}`,
    "appaloft-runtime",
  );
}

function renderTargetServiceName(value: string | undefined): string {
  return sanitizeDockerName(value ?? "web", "web");
}

function runtimeTargetUnsupported(input: {
  missingCapability: string;
  message: string;
}): ReturnType<typeof domainError.runtimeTargetUnsupported> {
  return domainError.runtimeTargetUnsupported(input.message, {
    phase: "runtime-target-render",
    targetKind: "orchestrator-cluster",
    providerKey: "docker-swarm",
    missingCapability: input.missingCapability,
  });
}

function executionState(runtimePlan: RuntimePlanState): RuntimeExecutionPlanState {
  return runtimePlan.execution.toState();
}

function metadataValue(
  runtimePlan: RuntimePlanState,
  execution: RuntimeExecutionPlanState,
  keys: readonly string[],
): string | undefined {
  const runtimeArtifactMetadata = runtimePlan.runtimeArtifact?.toState().metadata;
  for (const key of keys) {
    const artifactValue = runtimeArtifactMetadata?.[key];
    if (artifactValue) {
      return artifactValue;
    }

    const executionValue = execution.metadata?.[key];
    if (executionValue) {
      return executionValue;
    }
  }

  return undefined;
}

function renderImageWorkload(
  runtimePlan: RuntimePlanState,
  execution: RuntimeExecutionPlanState,
): Result<DockerSwarmImageWorkloadIntent> {
  const image = runtimePlan.runtimeArtifact?.toState().image ?? execution.image;
  if (!image) {
    return err(
      runtimeTargetUnsupported({
        missingCapability: "image-artifact",
        message: "Docker Swarm render requires an OCI image artifact",
      }),
    );
  }

  return ok({
    kind: "image",
    image: image.value,
    ...(execution.port ? { port: execution.port.value } : {}),
  });
}

function renderComposeWorkload(
  runtimePlan: RuntimePlanState,
  execution: RuntimeExecutionPlanState,
): Result<DockerSwarmComposeWorkloadIntent> {
  const composeFile = runtimePlan.runtimeArtifact?.toState().composeFile ?? execution.composeFile;
  if (!composeFile) {
    return err(
      runtimeTargetUnsupported({
        missingCapability: "compose-file",
        message: "Docker Swarm render requires a Compose file for Compose workloads",
      }),
    );
  }

  const targetServiceName = metadataValue(runtimePlan, execution, composeTargetServiceMetadataKeys);
  if (!targetServiceName) {
    return err(
      runtimeTargetUnsupported({
        missingCapability: "compose-target-service",
        message: "Docker Swarm render requires an unambiguous Compose target service",
      }),
    );
  }

  return ok({
    kind: "compose",
    composeFile: composeFile.value,
    targetServiceName: renderTargetServiceName(targetServiceName),
  });
}

function isComposeWorkload(runtimePlan: RuntimePlanState, execution: RuntimeExecutionPlanState): boolean {
  const runtimeArtifact = runtimePlan.runtimeArtifact?.toState();
  return (
    runtimeArtifact?.kind.value === "compose-project" ||
    execution.kind.value === "docker-compose-stack"
  );
}

function renderEnvironmentVariables(
  environmentSnapshot: EnvironmentSnapshotLike | undefined,
): DockerSwarmEnvironmentVariableIntent[] {
  return (
    environmentSnapshot
      ?.toState()
      .variables.filter((variable) => variable.exposure.value === "runtime")
      .map((variable) => ({
        name: variable.key.value,
        exposure: variable.exposure.value,
        scope: variable.scope.value,
        secret: variable.isSecret,
        ...(variable.isSecret
          ? { valueFrom: `secret:${variable.key.value}` }
          : { value: variable.value.value }),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)) ?? []
  );
}

function renderHealth(
  healthCheck: RuntimeHealthCheckPolicyState | undefined,
  execution: RuntimeExecutionPlanState,
): DockerSwarmHealthIntent | undefined {
  if (healthCheck) {
    return {
      enabled: healthCheck.enabled,
      type: healthCheck.type.value,
      intervalSeconds: healthCheck.intervalSeconds.value,
      timeoutSeconds: healthCheck.timeoutSeconds.value,
      retries: healthCheck.retries.value,
      startPeriodSeconds: healthCheck.startPeriodSeconds.value,
      ...(healthCheck.http
        ? {
            http: {
              method: healthCheck.http.method.value,
              scheme: healthCheck.http.scheme.value,
              host: healthCheck.http.host.value,
              ...(healthCheck.http.port ? { port: healthCheck.http.port.value } : {}),
              path: healthCheck.http.path.value,
              expectedStatusCode: healthCheck.http.expectedStatusCode.value,
              ...(healthCheck.http.expectedResponseText
                ? { expectedResponseText: healthCheck.http.expectedResponseText.value }
                : {}),
            },
          }
        : {}),
      ...(healthCheck.command ? { command: { redacted: true } } : {}),
    };
  }

  if (!execution.healthCheckPath) {
    return undefined;
  }

  return {
    enabled: true,
    type: "http",
    intervalSeconds: 10,
    timeoutSeconds: 5,
    retries: 3,
    startPeriodSeconds: 0,
    http: {
      method: "GET",
      scheme: "http",
      host: "127.0.0.1",
      ...(execution.port ? { port: execution.port.value } : {}),
      path: execution.healthCheckPath.value,
      expectedStatusCode: 200,
    },
  };
}

function renderRoutes(input: {
  execution: RuntimeExecutionPlanState;
  networkName: string;
}): DockerSwarmRouteIntent[] {
  return (
    input.execution.accessRoutes?.map((route) => {
      const targetPort = route.targetPort ?? input.execution.port?.value;
      return {
        proxyKind: route.proxyKind,
        domains: route.domains,
        pathPrefix: route.pathPrefix,
        tlsMode: route.tlsMode,
        ...(targetPort ? { targetPort } : {}),
        routeBehavior: route.routeBehavior,
        ...(route.redirectTo ? { redirectTo: route.redirectTo } : {}),
        ...(route.redirectStatus ? { redirectStatus: route.redirectStatus } : {}),
        networkName: input.networkName,
      };
    }) ?? []
  );
}

export function renderDockerSwarmRuntimeIntent(
  input: DockerSwarmRuntimeIntentInput,
): Result<DockerSwarmRuntimeIntent> {
  const runtimePlan = input.runtimePlan.toState();
  const execution = executionState(runtimePlan);
  const stackName = renderStackName(input.identity);
  const networkName = input.edgeNetworkName ?? defaultEdgeNetworkName;

  const workloadResult = isComposeWorkload(runtimePlan, execution)
    ? renderComposeWorkload(runtimePlan, execution)
    : renderImageWorkload(runtimePlan, execution);
  if (workloadResult.isErr()) {
    return err(workloadResult.error);
  }

  const workload = workloadResult.value;
  const targetServiceName =
    workload.kind === "compose" ? workload.targetServiceName : renderTargetServiceName("web");
  const health = renderHealth(execution.healthCheck, execution);

  return ok({
    schemaVersion: "docker-swarm.runtime-intent/v1",
    stackName,
    serviceName: `${stackName}_${targetServiceName}`,
    targetServiceName,
    workload,
    environment: renderEnvironmentVariables(input.environmentSnapshot),
    ...(health ? { health } : {}),
    routes: renderRoutes({ execution, networkName }),
    labels: {
      "appaloft.resource-id": input.identity.resourceId,
      "appaloft.deployment-id": input.identity.deploymentId,
      "appaloft.target-id": input.identity.targetId,
      "appaloft.destination-id": input.identity.destinationId,
      "appaloft.runtime-target": "docker-swarm",
    },
    warnings: [],
  });
}
