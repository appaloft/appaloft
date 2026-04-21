import { type DeploymentState } from "@appaloft/core";

const dockerLabelValueLimit = 512;

export interface DockerContainerIdentity {
  deploymentId: string;
  projectId: string;
  projectName?: string | undefined;
  projectSlug?: string | undefined;
  environmentId: string;
  environmentName?: string | undefined;
  environmentKind?: string | undefined;
  resourceId: string;
  resourceName?: string | undefined;
  resourceSlug?: string | undefined;
  resourceKind?: string | undefined;
  serverId?: string | undefined;
  serverName?: string | undefined;
  serverProvider?: string | undefined;
  targetKind?: string | undefined;
  destinationId: string;
  destinationName?: string | undefined;
  destinationKind?: string | undefined;
  executionKind?: string | undefined;
  buildStrategy?: string | undefined;
  packagingMode?: string | undefined;
  exposureMode?: string | undefined;
  upstreamProtocol?: string | undefined;
  sourceKind?: string | undefined;
  sourceDisplayName?: string | undefined;
  sourceRuntimeFamily?: string | undefined;
  sourceFramework?: string | undefined;
  sourcePackageManager?: string | undefined;
  sourceApplicationShape?: string | undefined;
  sourceProjectName?: string | undefined;
  runtimeArtifactKind?: string | undefined;
  runtimeArtifactIntent?: string | undefined;
  routeSource?: string | undefined;
  accessHostname?: string | undefined;
  accessScheme?: string | undefined;
  accessHosts?: readonly string[] | undefined;
  previewId?: string | undefined;
  previewNumber?: string | undefined;
  previewMode?: string | undefined;
  previewBranch?: string | undefined;
}

function normalizeDockerLabelValue(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length > dockerLabelValueLimit
    ? normalized.slice(0, dockerLabelValueLimit)
    : normalized;
}

function dockerLabel(key: string, value: string | undefined): string | undefined {
  const normalized = normalizeDockerLabelValue(value);
  return normalized ? `${key}=${normalized}` : undefined;
}

function requiredDockerLabel(key: string, value: string): string {
  return `${key}=${normalizeDockerLabelValue(value) ?? value}`;
}

function compactLabels(labels: Array<string | undefined>): string[] {
  return labels.filter((label): label is string => Boolean(label));
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function accessHostsLabelValue(accessHosts: readonly string[] | undefined): string | undefined {
  const hosts = accessHosts ? uniqueValues(accessHosts) : [];
  return hosts.length > 0 ? hosts.join(",") : undefined;
}

function previewIdentityFromEnvironment(input: {
  environmentKind?: string | undefined;
  environmentName?: string | undefined;
}): { previewId?: string; previewNumber?: string; previewMode?: string } {
  if (input.environmentKind !== "preview") {
    return {};
  }

  const environmentName = normalizeDockerLabelValue(input.environmentName);
  if (!environmentName) {
    return {};
  }

  const previewId = environmentName.startsWith("preview-")
    ? environmentName.slice("preview-".length)
    : environmentName;
  const pullRequestMatch = /^pr-(\d+)$/.exec(previewId);
  const previewNumber = pullRequestMatch?.[1];
  return {
    previewId,
    ...(previewNumber
      ? { previewNumber, previewMode: "pull-request" }
      : {}),
  };
}

export function appaloftDockerContainerLabels(identity: DockerContainerIdentity): string[] {
  const previewIdentity = previewIdentityFromEnvironment(identity);

  return compactLabels([
    requiredDockerLabel("appaloft.managed", "true"),
    requiredDockerLabel("appaloft.deployment-id", identity.deploymentId),
    requiredDockerLabel("appaloft.project-id", identity.projectId),
    dockerLabel("appaloft.project-name", identity.projectName),
    dockerLabel("appaloft.project-slug", identity.projectSlug),
    requiredDockerLabel("appaloft.environment-id", identity.environmentId),
    dockerLabel("appaloft.environment-name", identity.environmentName),
    dockerLabel("appaloft.environment-kind", identity.environmentKind),
    dockerLabel("appaloft.preview-id", identity.previewId ?? previewIdentity.previewId),
    dockerLabel("appaloft.preview-number", identity.previewNumber ?? previewIdentity.previewNumber),
    dockerLabel("appaloft.preview-mode", identity.previewMode ?? previewIdentity.previewMode),
    dockerLabel("appaloft.preview-branch", identity.previewBranch),
    requiredDockerLabel("appaloft.resource-id", identity.resourceId),
    dockerLabel("appaloft.resource-name", identity.resourceName),
    dockerLabel("appaloft.resource-slug", identity.resourceSlug),
    dockerLabel("appaloft.resource-kind", identity.resourceKind),
    dockerLabel("appaloft.server-id", identity.serverId),
    dockerLabel("appaloft.server-name", identity.serverName),
    dockerLabel("appaloft.server-provider", identity.serverProvider),
    dockerLabel("appaloft.target-kind", identity.targetKind),
    requiredDockerLabel("appaloft.destination-id", identity.destinationId),
    dockerLabel("appaloft.destination-name", identity.destinationName),
    dockerLabel("appaloft.destination-kind", identity.destinationKind),
    dockerLabel("appaloft.execution-kind", identity.executionKind),
    dockerLabel("appaloft.build-strategy", identity.buildStrategy),
    dockerLabel("appaloft.packaging-mode", identity.packagingMode),
    dockerLabel("appaloft.exposure-mode", identity.exposureMode),
    dockerLabel("appaloft.upstream-protocol", identity.upstreamProtocol),
    dockerLabel("appaloft.source-kind", identity.sourceKind),
    dockerLabel("appaloft.source-display-name", identity.sourceDisplayName),
    dockerLabel("appaloft.source-runtime-family", identity.sourceRuntimeFamily),
    dockerLabel("appaloft.source-framework", identity.sourceFramework),
    dockerLabel("appaloft.source-package-manager", identity.sourcePackageManager),
    dockerLabel("appaloft.source-application-shape", identity.sourceApplicationShape),
    dockerLabel("appaloft.source-project-name", identity.sourceProjectName),
    dockerLabel("appaloft.artifact-kind", identity.runtimeArtifactKind),
    dockerLabel("appaloft.artifact-intent", identity.runtimeArtifactIntent),
    dockerLabel("appaloft.route-source", identity.routeSource),
    dockerLabel("appaloft.access-host", identity.accessHostname),
    dockerLabel("appaloft.access-scheme", identity.accessScheme),
    dockerLabel("appaloft.access-hosts", accessHostsLabelValue(identity.accessHosts)),
  ]);
}

export function appaloftDockerContainerLabelsForDeployment(
  state: DeploymentState,
): string[] {
  const runtimePlan = state.runtimePlan;
  const source = runtimePlan.source;
  const sourceInspection = source.inspection;
  const execution = runtimePlan.execution;
  const metadata = execution.metadata ?? {};
  const target = runtimePlan.target;
  const accessHosts = uniqueValues(execution.accessRoutes.flatMap((route) => route.domains));

  return appaloftDockerContainerLabels({
    deploymentId: state.id.value,
    projectId: state.projectId.value,
    projectName: metadata["context.projectName"],
    projectSlug: metadata["context.projectSlug"],
    environmentId: state.environmentId.value,
    environmentName: metadata["context.environmentName"],
    environmentKind: metadata["context.environmentKind"],
    resourceId: state.resourceId.value,
    resourceName: metadata["context.resourceName"],
    resourceSlug: metadata["context.resourceSlug"] ?? metadata["resource.slug"],
    resourceKind: metadata["context.resourceKind"],
    serverId: state.serverId.value,
    serverName: metadata["context.serverName"],
    serverProvider: metadata["context.serverProviderKey"] ?? target.providerKey,
    targetKind: metadata["context.serverTargetKind"] ?? target.kind,
    destinationId: state.destinationId.value,
    destinationName: metadata["context.destinationName"],
    destinationKind: metadata["context.destinationKind"],
    executionKind: execution.kind,
    buildStrategy: runtimePlan.buildStrategy,
    packagingMode: runtimePlan.packagingMode,
    exposureMode: metadata["resource.exposureMode"],
    upstreamProtocol: metadata["resource.upstreamProtocol"],
    sourceKind: source.kind,
    sourceDisplayName: source.displayName,
    sourceRuntimeFamily: sourceInspection?.runtimeFamily,
    sourceFramework: sourceInspection?.framework,
    sourcePackageManager: sourceInspection?.packageManager,
    sourceApplicationShape: sourceInspection?.applicationShape,
    sourceProjectName: sourceInspection?.projectName,
    runtimeArtifactKind: runtimePlan.runtimeArtifact?.kind,
    runtimeArtifactIntent: runtimePlan.runtimeArtifact?.intent,
    routeSource: metadata["access.routeSource"],
    accessHostname: metadata["access.hostname"] ?? accessHosts[0],
    accessScheme: metadata["access.scheme"],
    accessHosts,
    previewId: metadata["preview.id"],
    previewNumber: metadata["preview.number"],
    previewMode: metadata["preview.mode"],
    previewBranch: metadata["preview.branch"],
  });
}

export function dockerContainerLabelFlags(input: {
  labels: readonly string[];
  quote: (value: string) => string;
}): string {
  return input.labels.map((label) => `--label ${input.quote(label)}`).join(" ");
}

export function dockerRemoveResourceContainersCommand(input: {
  resourceId: string;
  currentContainerName: string;
  quote: (value: string) => string;
}): string {
  const resourceLabelFilter = input.quote(`label=appaloft.resource-id=${input.resourceId}`);
  const currentContainerName = input.quote(input.currentContainerName);

  return [
    `docker ps -aq --filter ${resourceLabelFilter}`,
    "| while read -r container_id; do",
    `container_name="$(docker inspect -f '{{.Name}}' "$container_id" 2>/dev/null | sed 's#^/##')";`,
    `if [ "$container_name" != ${currentContainerName} ]; then`,
    'docker rm -f "$container_id";',
    "fi;",
    "done",
  ].join(" ");
}

export function dockerPublishedPortFlag(input: {
  containerPort: number;
  exposureMode?: string | undefined;
}): string {
  if (input.exposureMode === "direct-port") {
    return `-p ${input.containerPort}:${input.containerPort}`;
  }

  return `-p 127.0.0.1::${input.containerPort}`;
}

export function dockerPublishedPortCommand(input: {
  containerName: string;
  containerPort: number;
  quote: (value: string) => string;
}): string {
  const containerName = input.quote(input.containerName);
  const containerPort = input.quote(`${input.containerPort}/tcp`);

  return `docker port ${containerName} ${containerPort}`;
}

export function parseDockerPublishedHostPort(output: string): number | undefined {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return undefined;
  }

  const match = /(?::|^)(\d+)$/.exec(firstLine);
  if (!match) {
    return undefined;
  }

  const port = Number(match[1]);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}
