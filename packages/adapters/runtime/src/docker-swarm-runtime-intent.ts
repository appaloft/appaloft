import {
  blueprintComponentRuntimePlanFromMetadata,
  type BlueprintComponentRuntimePlan,
} from "@appaloft/blueprints";
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
import type { ResourceAccessFailureRendererTarget } from "@appaloft/application";
import {
  type DockerStorageVolumeRealization,
  dockerStorageMountsFromRuntimeMetadata,
  dockerStorageVolumeRealizationsFromRuntimeMetadata,
} from "./storage-runtime-mounts";

type RuntimePlanLike = {
  toState(): RuntimePlanState;
};

type EnvironmentSnapshotLike = EnvironmentSnapshot | { toState(): EnvironmentConfigSnapshotState };

export interface DockerSwarmRuntimeIdentityInput {
  resourceId: string;
  deploymentId: string;
  targetId: string;
  destinationId: string;
  configurationFingerprint?: string;
}

export interface DockerSwarmRuntimeIntentInput {
  runtimePlan: RuntimePlanLike;
  environmentSnapshot?: EnvironmentSnapshotLike;
  dependencyBindingReferences?: readonly DeploymentDependencyBindingReferenceState[];
  componentRuntime?: BlueprintComponentRuntimePlan;
  identity: DockerSwarmRuntimeIdentityInput;
  edgeNetworkName?: string;
  resourceAccessFailureRenderer?: ResourceAccessFailureRendererTarget;
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
  pathHandling: "preserve" | "strip";
  tlsMode: string;
  targetPort?: number;
  routeBehavior: "serve" | "redirect";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  networkName: string;
}

export interface DockerSwarmComponentLinkIntent {
  relationId: string;
  providerComponentId: string;
  providerServiceName: string;
  endpoint?: string;
  networkName: string;
  required: boolean;
}

export interface DockerSwarmReadinessGateIntent {
  relationId: string;
  providerComponentId: string;
  providerServiceName: string;
  kind: "order-after" | "readiness-gate";
  readiness: "created" | "started" | "healthy";
  required: boolean;
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

export interface DockerSwarmMountIntent {
  type: "volume" | "bind";
  source: string;
  target: string;
  readOnly: boolean;
}

export interface DockerSwarmRuntimeIntent {
  schemaVersion: "docker-swarm.runtime-intent/v1";
  stackName: string;
  serviceName: string;
  targetServiceName: string;
  workload: DockerSwarmWorkloadIntent;
  environment: DockerSwarmEnvironmentVariableIntent[];
  mounts: DockerSwarmMountIntent[];
  volumeRealizations: DockerStorageVolumeRealization[];
  health?: DockerSwarmHealthIntent;
  routes: DockerSwarmRouteIntent[];
  componentLinks: DockerSwarmComponentLinkIntent[];
  readinessGates: DockerSwarmReadinessGateIntent[];
  resourceAccessFailureRenderer?: ResourceAccessFailureRendererTarget;
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
  | "wait-for-component-readiness"
  | "create-candidate-service"
  | "deploy-candidate-stack"
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
const defaultTraefikCertificateResolver = "appaloft";
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
    ...(identity.configurationFingerprint
      ? { "appaloft.configuration-fingerprint": identity.configurationFingerprint }
      : {}),
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

function dockerNetworkFlags(networkNames: readonly string[]): string {
  return networkNames.map((networkName) => `--network ${shellQuote(networkName)}`).join(" ");
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

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function dockerComposeOverrideContent(input: {
  intent: DockerSwarmRuntimeIntent;
  networkNames: readonly string[];
}): string {
  const plainEnvironment = input.intent.environment.filter((variable) => !variable.secret);
  const secretEnvironment = input.intent.environment.filter((variable) => variable.secret);
  const volumeMounts = input.intent.mounts.filter((mount) => mount.type === "volume");
  const uniqueVolumeNames = [...new Set(volumeMounts.map((mount) => mount.source))].sort();
  const labelsByVolumeName = new Map(
    input.intent.volumeRealizations.map((realization) => [
      realization.volumeName,
      realization.labels,
    ]),
  );
  const uniqueSecretSources = [
    ...new Set(secretEnvironment.map((variable) => dockerSecretSource(variable))),
  ].sort();
  const serviceLines = [
    "services:",
    `  ${yamlQuoted(input.intent.targetServiceName)}:`,
    "    deploy:",
    "      labels:",
    ...Object.entries(input.intent.labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `        ${yamlQuoted(key)}: ${yamlQuoted(value)}`),
    ...(plainEnvironment.length > 0
      ? [
          "    environment:",
          ...plainEnvironment.map(
            (variable) => `      ${yamlQuoted(variable.name)}: ${yamlQuoted(variable.value ?? "")}`,
          ),
        ]
      : []),
    ...(uniqueSecretSources.length > 0
      ? [
          "    secrets:",
          ...secretEnvironment.map((variable) => {
            const source = dockerSecretSource(variable);
            return [
              `      - source: ${yamlQuoted(source)}`,
              `        target: ${yamlQuoted(variable.name)}`,
            ];
          }).flat(),
        ]
      : []),
    ...(input.intent.mounts.length > 0
      ? [
          "    volumes:",
          ...input.intent.mounts
            .map((mount) => [
              `      - type: ${yamlQuoted(mount.type)}`,
              `        source: ${yamlQuoted(mount.source)}`,
              `        target: ${yamlQuoted(mount.target)}`,
              ...(mount.readOnly ? ["        read_only: true"] : []),
            ])
            .flat(),
        ]
      : []),
    "    networks:",
    ...input.networkNames.map((networkName) => `      - ${yamlQuoted(networkName)}`),
  ];
  const networkLines = [
    "networks:",
    ...input.networkNames.flatMap((networkName) => [
      `  ${yamlQuoted(networkName)}:`,
      "    external: true",
    ]),
  ];
  const volumeLines =
    uniqueVolumeNames.length > 0
      ? [
          "volumes:",
          ...uniqueVolumeNames.flatMap((volumeName) => {
            const labels = labelsByVolumeName.get(volumeName);
            return [
              `  ${yamlQuoted(volumeName)}:`,
              `    name: ${yamlQuoted(volumeName)}`,
              ...(labels
                ? [
                    "    labels:",
                    ...Object.entries(labels)
                      .sort(([left], [right]) => left.localeCompare(right))
                      .map(([key, value]) => `      ${yamlQuoted(key)}: ${yamlQuoted(value)}`),
                  ]
                : []),
            ];
          }),
        ]
      : [];
  const secretLines =
    uniqueSecretSources.length > 0
      ? [
          "secrets:",
          ...uniqueSecretSources.flatMap((secretName) => [
            `  ${yamlQuoted(secretName)}:`,
            "    external: true",
          ]),
        ]
      : [];

  return [
    ...serviceLines,
    ...networkLines,
    ...volumeLines,
    ...secretLines,
  ].join("\n");
}

function stackDeployCommand(input: {
  composeFile: string;
  intent: DockerSwarmRuntimeIntent;
  networkNames: readonly string[];
}): string {
  const overrideContent = dockerComposeOverrideContent(input);
  return [
    "override_file=$(mktemp -t appaloft-swarm-compose-override.XXXXXX.yml)",
    `printf %s ${shellQuote(overrideContent)} > "$override_file"`,
    `docker stack deploy -c ${shellQuote(input.composeFile)} -c "$override_file" ${shellQuote(input.intent.stackName)}`,
    'status="$?"',
    'rm -f "$override_file"',
    'exit "$status"',
  ].join("; ");
}

function dockerMountFlags(mounts: readonly DockerSwarmMountIntent[]): string {
  return mounts
    .map((mount) =>
      `--mount ${shellQuote(
        [
          `type=${mount.type}`,
          `source=${mount.source}`,
          `target=${mount.target}`,
          mount.readOnly ? "readonly" : "",
        ]
          .filter((part) => part.length > 0)
          .join(","),
      )}`,
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

function componentRuntimePlanFromMetadata(
  runtimePlan: RuntimePlanState,
  execution: RuntimeExecutionPlanState,
): BlueprintComponentRuntimePlan | undefined {
  const runtimeArtifactMetadata = runtimePlan.runtimeArtifact?.toState().metadata;
  return (
    blueprintComponentRuntimePlanFromMetadata(runtimeArtifactMetadata) ??
    blueprintComponentRuntimePlanFromMetadata(execution.metadata)
  );
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

function otelSignalEnvironmentName(signal: "traces" | "metrics" | "logs"): string {
  switch (signal) {
    case "traces":
      return "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT";
    case "metrics":
      return "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT";
    case "logs":
      return "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT";
  }
}

function renderEnvironmentVariables(
  environmentSnapshot: EnvironmentSnapshotLike | undefined,
  identity: DockerSwarmRuntimeIdentityInput,
  dependencyBindingReferences: readonly DeploymentDependencyBindingReferenceState[] = [],
  componentRuntime: BlueprintComponentRuntimePlan | undefined,
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
  const componentRelationVariables =
    componentRuntime?.injectedEnv.map((variable) => ({
      name: variable.name,
      exposure: "runtime",
      scope: "component-relation",
      secret: false,
      value: variable.value,
    })) ?? [];
  const telemetryVariables =
    componentRuntime?.telemetryAttachments.map((attachment) => ({
      name: otelSignalEnvironmentName(attachment.signal),
      exposure: "runtime",
      scope: "component-relation",
      secret: false,
      value: attachment.endpointUrl,
    })) ?? [];

  return [
    ...snapshotVariables,
    ...dependencyVariables,
    ...componentRelationVariables,
    ...telemetryVariables,
  ].sort((left, right) => left.name.localeCompare(right.name));
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
        pathHandling: route.pathHandling,
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

function safeTraefikName(input: string | undefined, fallback: string): string {
  const normalized = input?.replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function safeRendererServiceUrl(input: string | undefined): string | null {
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function accessFailureMiddlewareLabels(
  renderer: ResourceAccessFailureRendererTarget | undefined,
):
  | {
      labels: string[];
      middlewareName: string;
    }
  | undefined {
  const serviceUrl = safeRendererServiceUrl(renderer?.url);
  if (!renderer || !serviceUrl) {
    return undefined;
  }

  const middlewareName = safeTraefikName(
    renderer.middlewareName,
    "appaloft-resource-access-errors",
  );
  const serviceName = safeTraefikName(renderer.serviceName, "appaloft-diagnostic-renderer");

  return {
    middlewareName,
    labels: [
      `traefik.http.middlewares.${middlewareName}.errors.status=404,502,503,504`,
      `traefik.http.middlewares.${middlewareName}.errors.service=${serviceName}`,
      `traefik.http.middlewares.${middlewareName}.errors.query=/.appaloft/resource-access-failure?status={status}`,
      `traefik.http.services.${serviceName}.loadbalancer.server.url=${serviceUrl}`,
      `traefik.http.services.${serviceName}.loadbalancer.passhostheader=false`,
    ],
  };
}

function routeLabels(input: {
  serviceName: string;
  targetPort?: number;
  routes: readonly DockerSwarmRouteIntent[];
  resourceAccessFailureRenderer?: ResourceAccessFailureRendererTarget;
}): string[] {
  const accessFailureMiddleware = accessFailureMiddlewareLabels(input.resourceAccessFailureRenderer);
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
    const pathHandlingMiddleware =
      route.pathHandling === "strip" && route.pathPrefix !== "/" ? `${router}-strip-prefix` : null;
    const middlewares = [
      ...(pathHandlingMiddleware ? [pathHandlingMiddleware] : []),
      ...(accessFailureMiddleware ? [accessFailureMiddleware.middlewareName] : []),
    ];

    return [
      "traefik.enable=true",
      `traefik.docker.network=${route.networkName}`,
      `traefik.http.routers.${router}.rule=${traefikRule(route)}`,
      `traefik.http.routers.${router}.entrypoints=${entrypoint}`,
      ...(middlewares.length > 0
        ? [`traefik.http.routers.${router}.middlewares=${middlewares.join(",")}`]
        : []),
      ...(pathHandlingMiddleware
        ? [
            `traefik.http.middlewares.${pathHandlingMiddleware}.stripprefix.prefixes=${route.pathPrefix}`,
          ]
        : []),
      ...(route.tlsMode === "auto"
        ? [
            `traefik.http.routers.${router}.tls=true`,
            `traefik.http.routers.${router}.tls.certresolver=${defaultTraefikCertificateResolver}`,
          ]
        : []),
      `traefik.http.routers.${router}.service=${service}`,
      `traefik.http.services.${service}.loadbalancer.server.port=${targetPort}`,
      ...(accessFailureMiddleware ? accessFailureMiddleware.labels : []),
      "appaloft.route-target=active",
    ];
  });

  return [...new Set(labels)];
}

function safeDockerLabelSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relation"
  );
}

function providerServiceNameForComponentRuntime(input: {
  componentRuntime: BlueprintComponentRuntimePlan;
  providerComponentId: string;
}): string {
  return (
    input.componentRuntime.serviceDiscovery.find(
      (link) => link.providerComponentId === input.providerComponentId,
    )?.serviceName ??
    input.componentRuntime.readinessGates.find(
      (gate) => gate.providerComponentId === input.providerComponentId,
    )?.providerServiceName ??
    input.componentRuntime.telemetryAttachments.find(
      (attachment) => attachment.providerComponentId === input.providerComponentId,
    )?.providerServiceName ??
    input.providerComponentId
  );
}

function renderComponentLinks(
  componentRuntime: BlueprintComponentRuntimePlan | undefined,
): DockerSwarmComponentLinkIntent[] {
  if (!componentRuntime) {
    return [];
  }

  const links = new Map<string, DockerSwarmComponentLinkIntent>();
  const upsertLink = (input: {
    readonly relationId: string;
    readonly providerComponentId: string;
    readonly providerServiceName?: string;
    readonly endpoint?: string;
    readonly required: boolean;
    readonly networkName?: string;
  }) => {
    const previous = links.get(input.relationId);
    const endpoint = input.endpoint ?? previous?.endpoint;
    links.set(input.relationId, {
      relationId: input.relationId,
      providerComponentId: input.providerComponentId,
      providerServiceName:
        input.providerServiceName ??
        previous?.providerServiceName ??
        providerServiceNameForComponentRuntime({
          componentRuntime,
          providerComponentId: input.providerComponentId,
        }),
      ...(endpoint ? { endpoint } : {}),
      networkName: input.networkName ?? previous?.networkName ?? componentRuntime.networkName,
      required: input.required || previous?.required === true,
    });
  };

  for (const discovery of componentRuntime.serviceDiscovery) {
    upsertLink({
      relationId: discovery.relationId,
      providerComponentId: discovery.providerComponentId,
      providerServiceName: discovery.serviceName,
      ...(discovery.endpoint ? { endpoint: discovery.endpoint } : {}),
      required: discovery.required,
    });
  }
  for (const allow of componentRuntime.networkAllows) {
    upsertLink({
      relationId: allow.relationId,
      providerComponentId: allow.providerComponentId,
      networkName: allow.networkName,
      required: allow.required,
    });
  }
  for (const gate of componentRuntime.readinessGates) {
    upsertLink({
      relationId: gate.relationId,
      providerComponentId: gate.providerComponentId,
      providerServiceName: gate.providerServiceName,
      required: gate.required,
    });
  }
  for (const attachment of componentRuntime.telemetryAttachments) {
    upsertLink({
      relationId: attachment.relationId,
      providerComponentId: attachment.providerComponentId,
      providerServiceName: attachment.providerServiceName,
      ...(attachment.endpoint ? { endpoint: attachment.endpoint } : {}),
      required: attachment.required,
    });
  }

  return [...links.values()].sort((left, right) => left.relationId.localeCompare(right.relationId));
}

function renderReadinessGates(
  componentRuntime: BlueprintComponentRuntimePlan | undefined,
): DockerSwarmReadinessGateIntent[] {
  return (
    componentRuntime?.readinessGates.map((gate) => ({
      relationId: gate.relationId,
      providerComponentId: gate.providerComponentId,
      providerServiceName: gate.providerServiceName,
      kind: gate.kind,
      readiness: gate.readiness,
      required: gate.required,
    })) ?? []
  );
}

function componentRuntimeLabels(
  componentRuntime: BlueprintComponentRuntimePlan | undefined,
): Record<string, string> {
  if (!componentRuntime) {
    return {};
  }

  const labels: Record<string, string> = {
    "appaloft.component-id": componentRuntime.componentId,
    "appaloft.component-service": componentRuntime.serviceName,
  };

  for (const link of renderComponentLinks(componentRuntime)) {
    const segment = safeDockerLabelSegment(link.relationId);
    labels[`appaloft.component-link.${segment}.provider`] = link.providerComponentId;
    labels[`appaloft.component-link.${segment}.service`] = link.providerServiceName;
    labels[`appaloft.component-link.${segment}.required`] = String(link.required);
    labels[`appaloft.component-link.${segment}.network`] = link.networkName;
    if (link.endpoint) {
      labels[`appaloft.component-link.${segment}.endpoint`] = link.endpoint;
    }
  }

  for (const gate of componentRuntime.readinessGates) {
    const segment = safeDockerLabelSegment(gate.relationId);
    labels[`appaloft.component-link.${segment}.readiness`] = gate.readiness;
  }
  for (const attachment of componentRuntime.telemetryAttachments) {
    const segment = safeDockerLabelSegment(attachment.relationId);
    labels[`appaloft.component-link.${segment}.telemetry`] = attachment.signal;
  }

  return labels;
}

export function renderDockerSwarmRuntimeIntent(
  input: DockerSwarmRuntimeIntentInput,
): Result<DockerSwarmRuntimeIntent> {
  const runtimePlan = input.runtimePlan.toState();
  const execution = executionState(runtimePlan);
  const stackName = renderStackName(input.identity);
  const networkName = input.edgeNetworkName ?? defaultEdgeNetworkName;
  const componentRuntime =
    input.componentRuntime ?? componentRuntimePlanFromMetadata(runtimePlan, execution);
  const componentLinks = renderComponentLinks(componentRuntime);
  const readinessGates = renderReadinessGates(componentRuntime);

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
  const mounts = dockerStorageMountsFromRuntimeMetadata({
    ...(runtimePlan.runtimeArtifact?.toState().metadata ?? {}),
    ...(execution.metadata ?? {}),
  });
  if (mounts.isErr()) {
    return err(mounts.error);
  }
  const volumeRealizations = dockerStorageVolumeRealizationsFromRuntimeMetadata({
    ...(runtimePlan.runtimeArtifact?.toState().metadata ?? {}),
    ...(execution.metadata ?? {}),
  });
  if (volumeRealizations.isErr()) {
    return err(volumeRealizations.error);
  }

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
      componentRuntime,
    ),
    mounts: mounts.value.map((mount) => ({
      type: mount.type,
      source: mount.source,
      target: mount.target,
      readOnly: mount.readOnly ?? false,
    })),
    volumeRealizations: volumeRealizations.value,
    ...(health ? { health } : {}),
    routes: renderRoutes({ execution, networkName }),
    componentLinks,
    readinessGates,
    ...(input.resourceAccessFailureRenderer
      ? { resourceAccessFailureRenderer: input.resourceAccessFailureRenderer }
      : {}),
    labels: {
      ...runtimeIdentityLabels(input.identity),
      ...componentRuntimeLabels(componentRuntime),
    },
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
    'for service_id in $service_ids; do stack_name=$(docker service inspect "$service_id" --format \'{{ index .Spec.Labels "com.docker.stack.namespace" }}\'); if [ -n "$stack_name" ] && [ "$stack_name" != "<no value>" ]; then docker stack rm "$stack_name"; else docker service rm "$service_id"; fi; done',
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

function requiredReadinessStep(
  gates: readonly DockerSwarmReadinessGateIntent[],
): DockerSwarmApplyPlanStep | undefined {
  const requiredGates = gates.filter((gate) => gate.required);
  if (requiredGates.length === 0) {
    return undefined;
  }

  const command = requiredGates
    .map((gate) =>
      [
        `echo ${shellQuote(
          `Waiting for ${gate.providerServiceName} before ${gate.relationId}`,
        )}`,
        `until docker service ps --filter ${shellQuote("desired-state=running")} ${shellQuote(
          gate.providerServiceName,
        )} | grep -q .; do sleep 2; done`,
      ].join("; "),
    )
    .join("; ");

  return {
    step: "wait-for-component-readiness",
    command,
    displayCommand: command,
  };
}

export function renderDockerSwarmApplyPlan(
  intent: DockerSwarmRuntimeIntent,
): Result<DockerSwarmApplyPlan> {
  const networkNames = [
    ...new Set([
      ...intent.componentLinks.map((link) => link.networkName),
      ...intent.routes.map((route) => route.networkName),
    ]),
  ];
  const resolvedNetworkNames = networkNames.length > 0 ? networkNames : [defaultEdgeNetworkName];
  const labels = routeLabels({
    serviceName: intent.serviceName,
    ...(intent.workload.kind === "image" && intent.workload.port
      ? { targetPort: intent.workload.port }
      : {}),
    routes: intent.routes,
    ...(intent.resourceAccessFailureRenderer
      ? { resourceAccessFailureRenderer: intent.resourceAccessFailureRenderer }
      : {}),
  });
  const createStep =
    intent.workload.kind === "image"
      ? {
          step: "create-candidate-service" as const,
          command: commandParts([
            "docker service create",
            `--name ${shellQuote(intent.serviceName)}`,
            dockerLabelFlags(intent.labels),
            dockerNetworkFlags(resolvedNetworkNames),
            intent.workload.registryAuth ? "--with-registry-auth" : "",
            dockerEnvironmentFlags(intent.environment),
            dockerMountFlags(intent.mounts),
            dockerHealthFlags(intent.health),
            shellQuote(intent.workload.image),
          ]),
          displayCommand: commandParts([
            "docker service create",
            `--name ${shellQuote(intent.serviceName)}`,
            dockerLabelFlags(intent.labels),
            dockerNetworkFlags(resolvedNetworkNames),
            intent.workload.registryAuth ? "--with-registry-auth" : "",
            dockerEnvironmentDisplayFlags(intent.environment),
            dockerMountFlags(intent.mounts),
            dockerHealthFlags(intent.health),
            shellQuote(intent.workload.image),
          ]),
        }
      : {
          step: "deploy-candidate-stack" as const,
          command: stackDeployCommand({
            composeFile: intent.workload.composeFile,
            intent,
            networkNames: resolvedNetworkNames,
          }),
          displayCommand: stackDeployCommand({
            composeFile: intent.workload.composeFile,
            intent,
            networkNames: resolvedNetworkNames,
          }),
        };
  const readinessStep = requiredReadinessStep(intent.readinessGates);

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
    `if [ "$current_deployment" != ${shellQuote(intent.labels["appaloft.deployment-id"] ?? "")} ]; then stack_name=$(docker service inspect "$service_id" --format ${shellQuote("{{ index .Spec.Labels \"com.docker.stack.namespace\" }}")}); if [ -n "$stack_name" ] && [ "$stack_name" != "<no value>" ]; then docker stack rm "$stack_name"; else docker service rm "$service_id"; fi; fi;`,
    "done",
  ]);

  return ok({
    schemaVersion: "docker-swarm.apply-plan/v1",
    serviceName: intent.serviceName,
    preservesPreviousService: true,
    routeLabels: labels,
    steps: [
      ...(readinessStep ? [readinessStep] : []),
      createStep,
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
