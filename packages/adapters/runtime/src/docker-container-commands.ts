export interface DockerContainerIdentity {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  destinationId: string;
}

export function yunduDockerContainerLabels(identity: DockerContainerIdentity): string[] {
  return [
    "yundu.managed=true",
    `yundu.deployment-id=${identity.deploymentId}`,
    `yundu.project-id=${identity.projectId}`,
    `yundu.environment-id=${identity.environmentId}`,
    `yundu.resource-id=${identity.resourceId}`,
    `yundu.destination-id=${identity.destinationId}`,
  ];
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
  const resourceLabelFilter = input.quote(`label=yundu.resource-id=${input.resourceId}`);
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
