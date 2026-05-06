import {
  domainError,
  type DeploymentDependencyBindingReferenceState,
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
  dependencyBindingReferences?: readonly DeploymentDependencyBindingReferenceState[];
  identity: DockerSwarmRuntimeIdentityInput;
  edgeNetworkName?: string;
}

export interface DockerSwarmImageWorkloadIntent {
  kind: "image";
  image: string;
  port?: number;
  registryAuth?: {
    required: true;
    secretRef: "********";
    redacted: true;
  };
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

export interface DockerSwarmCleanupCommand {
  step: "remove-services";
  command: string;
  displayCommand: string;
}

export interface DockerSwarmCleanupPlan {
  schemaVersion: "docker-swarm.cleanup-plan/v1";
  scopeLabels: Record<string, string>;
  commands: DockerSwarmCleanupCommand[];
  warnings: string[];
}

export type DockerSwarmApplyPlanStepName =
  | "create-candidate-service"
  | "verify-candidate-service"
  | "promote-route-target"
  | "cleanup-superseded-services";

export interface DockerSwarmApplyPlanStep {
  step: DockerSwarmApplyPlanStepName;
  command: string;
  displayCommand: string;
}

export interface DockerSwarmApplyPlan {
  schemaVersion: "docker-swarm.apply-plan/v1";
  serviceName: string;
  preservesPreviousService: true;
  routeLabels: string[];
  steps: DockerSwarmApplyPlanStep[];
  warnings: string[];
}

const defaultEdgeNetworkName = "appaloft-edge";
const composeTargetServiceMetadataKeys = [
  "swarmTargetService",
  "composeTargetService",
  "targetServiceName",
] as const;
const registryAuthMetadataKeys = [
  "swarmRegistryAuthSecretRef",
  "registryAuthSecretRef",
  "imagePullSecretRef",
  "pullSecretRef",
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
    `appaloft-${identity.resourceId}-${identity.destinationId}-${identity.deploymentId}`,
    "appaloft-runtime",
  );
}

function renderTargetServiceName(value: string | undefined): string {
  return sanitizeDockerName(value ?? "web", "web");
}

export function renderDockerSwarmDependencySecretName(input: {
  identity: DockerSwarmRuntimeIdentityInput;
  targetName: string;
}): string {
  return sanitizeDockerName(
    `appaloft-${input.identity.deploymentId}-${input.targetName}`,
    "appaloft-dependency-secret",
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function runtimeIdentityLabels(identity: DockerSwarmRuntimeIdentityInput): Record<string, string> {
  return {
    "appaloft.managed": "true",
    "appaloft.resource-id": identity.resourceId,
    "appaloft.deployment-id": identity.deploymentId,
    "appaloft.target-id": identity.targetId,
    "appaloft.destination-id": identity.destinationId,
    "appaloft.runtime-target": "docker-swarm",
  };
}

function dockerServiceLabelFilters(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `--filter ${shellQuote(`label=${key}=${value}`)}`)
    .join(" ");
}

function dockerLabelFlags(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `--label ${shellQuote(`${key}=${value}`)}`)
    .join(" ");
}

function dockerEnvironmentFlags(environment: readonly DockerSwarmEnvironmentVariableIntent[]): string {
  return environment
    .map((variable) =>
      variable.secret
        ? `--secret ${shellQuote(`source=${dockerSecretSource(variable)},target=${variable.name}`)}`
        : `--env ${shellQuote(`${variable.name}=${variable.value ?? ""}`)}`,
    )
    .join(" ");
}

function dockerEnvironmentDisplayFlags(
  environment: readonly DockerSwarmEnvironmentVariableIntent[],
): string {
  return environment
    .map((variable) =>
      variable.secret
        ? `--secret ${shellQuote(`source=${dockerSecretSource(variable)},target=${variable.name}`)}`
        : `--env ${shellQuote(`${variable.name}=********`)}`,
    )
    .join(" ");
}

function dockerSecretSource(variable: DockerSwarmEnvironmentVariableIntent): string {
  const secretPrefix = "secret:";
  if (variable.valueFrom?.startsWith(secretPrefix)) {
    return variable.valueFrom.slice(secretPrefix.length);
  }

  return variable.name;
}

function dockerHealthFlags(health: DockerSwarmHealthIntent | undefined): string {
  if (!health?.enabled) {
    return "";
  }

  if (health.type === "command") {
    return "--health-cmd '[redacted]'";
  }

  const http = health.http;
  if (!http) {
    return "";
  }

  const port = http.port ? `:${http.port}` : "";
  const healthUrl = `${http.scheme}://${http.host}${port}${http.path}`;
  return [
    `--health-cmd ${shellQuote(`wget -q -O- ${healthUrl} >/dev/null`)}`,
    `--health-interval ${shellQuote(`${health.intervalSeconds}s`)}`,
    `--health-timeout ${shellQuote(`${health.timeoutSeconds}s`)}`,
    `--health-retries ${shellQuote(`${health.retries}`)}`,
    `--health-start-period ${shellQuote(`${health.startPeriodSeconds}s`)}`,
  ].join(" ");
}

function routeLabelFlags(labels: readonly string[]): string {
  return labels.map((label) => `--label-add ${shellQuote(label)}`).join(" ");
}

function commandParts(parts: readonly string[]): string {
  return parts.filter((part) => part.trim().length > 0).join(" ");
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

  const registryAuthSecretRef = metadataValue(runtimePlan, execution, registryAuthMetadataKeys);

  return ok({
    kind: "image",
    image: image.value,
    ...(execution.port ? { port: execution.port.value } : {}),
    ...(registryAuthSecretRef
      ? { registryAuth: { required: true, secretRef: "********", redacted: true } }
      : {}),
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
  identity: DockerSwarmRuntimeIdentityInput,
  dependencyBindingReferences: readonly DeploymentDependencyBindingReferenceState[] = [],
): DockerSwarmEnvironmentVariableIntent[] {
  const snapshotVariables =
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
      .sort((left, right) => left.name.localeCompare(right.name)) ?? [];
  const dependencyVariables = dependencyBindingReferences
    .filter(
      (reference) =>
        reference.runtimeSecretRef &&
        reference.snapshotReadiness.isReady() &&
        reference.scope.value === "runtime-only" &&
        reference.injectionMode.value === "env",
    )
    .map((reference) => ({
      name: reference.targetName.value,
      exposure: "runtime",
      scope: "deployment",
      secret: true,
      valueFrom: `secret:${renderDockerSwarmDependencySecretName({
        identity,
        targetName: reference.targetName.value,
      })}`,
    }));

  return [...snapshotVariables, ...dependencyVariables].sort((left, right) =>
    left.name.localeCompare(right.name),
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

function proxyRouteName(input: { serviceName: string; index: number }): string {
  const normalized = `${input.serviceName}${input.index === 0 ? "" : `-${input.index}`}`
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "appaloft-swarm-route";
}

function traefikRule(route: DockerSwarmRouteIntent): string {
  const hostRule = route.domains.map((domain) => `Host(\`${domain}\`)`).join(" || ");
  return route.pathPrefix === "/"
    ? hostRule
    : `(${hostRule}) && PathPrefix(\`${route.pathPrefix}\`)`;
}

function routeLabels(input: {
  serviceName: string;
  targetPort?: number;
  routes: readonly DockerSwarmRouteIntent[];
}): string[] {
  const labels = input.routes.flatMap((route, index) => {
    if (
      route.proxyKind !== "traefik" ||
      route.routeBehavior !== "serve" ||
      route.domains.length === 0
    ) {
      return [];
    }

    const targetPort = route.targetPort ?? input.targetPort;
    if (!targetPort) {
      return [];
    }

    const router = proxyRouteName({ serviceName: input.serviceName, index });
    const service = `${router}-svc`;
    const entrypoint = route.tlsMode === "auto" ? "websecure" : "web";

    return [
      "traefik.enable=true",
      `traefik.docker.network=${route.networkName}`,
      `traefik.http.routers.${router}.rule=${traefikRule(route)}`,
      `traefik.http.routers.${router}.entrypoints=${entrypoint}`,
      ...(route.tlsMode === "auto" ? [`traefik.http.routers.${router}.tls=true`] : []),
      `traefik.http.routers.${router}.service=${service}`,
      `traefik.http.services.${service}.loadbalancer.server.port=${targetPort}`,
      "appaloft.route-target=active",
    ];
  });

  return [...new Set(labels)];
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
    environment: renderEnvironmentVariables(
      input.environmentSnapshot,
      input.identity,
      input.dependencyBindingReferences,
    ),
    ...(health ? { health } : {}),
    routes: renderRoutes({ execution, networkName }),
    labels: runtimeIdentityLabels(input.identity),
    warnings: [],
  });
}

export function renderDockerSwarmCleanupPlan(
  identity: DockerSwarmRuntimeIdentityInput,
): DockerSwarmCleanupPlan {
  const scopeLabels = runtimeIdentityLabels(identity);
  const filters = dockerServiceLabelFilters(scopeLabels);
  const command = [
    `service_ids=$(docker service ls -q ${filters})`,
    'if [ -n "$service_ids" ]; then docker service rm $service_ids; fi',
  ].join("; ");

  return {
    schemaVersion: "docker-swarm.cleanup-plan/v1",
    scopeLabels,
    commands: [
      {
        step: "remove-services",
        command,
        displayCommand: command,
      },
    ],
    warnings: [],
  };
}

export function renderDockerSwarmApplyPlan(
  intent: DockerSwarmRuntimeIntent,
): Result<DockerSwarmApplyPlan> {
  if (intent.workload.kind !== "image") {
    return err(
      runtimeTargetUnsupported({
        missingCapability: "image-apply-plan",
        message: "Docker Swarm apply planning currently requires an OCI image workload",
      }),
    );
  }

  const networkNames = [...new Set(intent.routes.map((route) => route.networkName))];
  const primaryNetwork = networkNames[0] ?? defaultEdgeNetworkName;
  const labels = routeLabels({
    serviceName: intent.serviceName,
    ...(intent.workload.port ? { targetPort: intent.workload.port } : {}),
    routes: intent.routes,
  });
  const createCommand = commandParts([
    "docker service create",
    `--name ${shellQuote(intent.serviceName)}`,
    dockerLabelFlags(intent.labels),
    `--network ${shellQuote(primaryNetwork)}`,
    intent.workload.registryAuth ? "--with-registry-auth" : "",
    dockerEnvironmentFlags(intent.environment),
    dockerHealthFlags(intent.health),
    shellQuote(intent.workload.image),
  ]);
  const createDisplayCommand = commandParts([
    "docker service create",
    `--name ${shellQuote(intent.serviceName)}`,
    dockerLabelFlags(intent.labels),
    `--network ${shellQuote(primaryNetwork)}`,
    intent.workload.registryAuth ? "--with-registry-auth" : "",
    dockerEnvironmentDisplayFlags(intent.environment),
    dockerHealthFlags(intent.health),
    shellQuote(intent.workload.image),
  ]);

  const verifyCommand = commandParts([
    "docker service ps",
    "--filter 'desired-state=running'",
    shellQuote(intent.serviceName),
  ]);
  const promoteCommand = commandParts([
    "docker service update",
    `--label-add ${shellQuote("appaloft.route-candidate=ready")}`,
    routeLabelFlags(labels),
    shellQuote(intent.serviceName),
  ]);
  const cleanupCommand = commandParts([
    "docker service ls -q",
    dockerServiceLabelFilters({
      "appaloft.managed": "true",
      "appaloft.resource-id": intent.labels["appaloft.resource-id"] ?? "",
      "appaloft.destination-id": intent.labels["appaloft.destination-id"] ?? "",
      "appaloft.runtime-target": "docker-swarm",
    }),
    "| while read -r service_id; do",
    `current_deployment=$(docker service inspect "$service_id" --format ${shellQuote("{{ index .Spec.Labels \"appaloft.deployment-id\" }}")});`,
    `if [ "$current_deployment" != ${shellQuote(intent.labels["appaloft.deployment-id"] ?? "")} ]; then docker service rm "$service_id"; fi;`,
    "done",
  ]);

  return ok({
    schemaVersion: "docker-swarm.apply-plan/v1",
    serviceName: intent.serviceName,
    preservesPreviousService: true,
    routeLabels: labels,
    steps: [
      {
        step: "create-candidate-service",
        command: createCommand,
        displayCommand: createDisplayCommand,
      },
      {
        step: "verify-candidate-service",
        command: verifyCommand,
        displayCommand: verifyCommand,
      },
      {
        step: "promote-route-target",
        command: promoteCommand,
        displayCommand: promoteCommand,
      },
      {
        step: "cleanup-superseded-services",
        command: cleanupCommand,
        displayCommand: cleanupCommand,
      },
    ],
    warnings: [],
  });
}
