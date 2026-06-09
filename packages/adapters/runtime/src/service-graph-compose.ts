import { type RequestedDeploymentServiceConfig } from "@appaloft/application";

const generatedServiceGraphComposeFile = ".appaloft/service-graph.compose.yml";
const generatedReplicatedWorkloadComposeFile = ".appaloft/replicated-workload.compose.yml";

interface RenderServiceGraphComposeInput {
  image: string;
  dockerfilePath: string;
  services: RequestedDeploymentServiceConfig[];
  defaultPort: number;
}

interface RenderReplicatedWorkloadComposeInput {
  image: string;
  dockerfilePath?: string;
  serviceName: string;
  defaultPort?: number;
  replicas: number;
  command?: string;
  includeBuild: boolean;
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function serviceCommand(service: RequestedDeploymentServiceConfig): string | undefined {
  return service.runtime?.startCommand;
}

function servicePort(
  service: RequestedDeploymentServiceConfig,
  defaultPort: number,
): number | undefined {
  return service.network?.internalPort ?? (service.kind === "web" || service.kind === "api" ? defaultPort : undefined);
}

function serviceEnvironment(service: RequestedDeploymentServiceConfig): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(service.env ?? {})) {
    entries[key] = String(value);
  }

  for (const key of Object.keys(service.secrets ?? {})) {
    entries[key] = `\${${key}}`;
  }

  return entries;
}

function renderService(input: {
  service: RequestedDeploymentServiceConfig;
  image: string;
  dockerfilePath: string;
  defaultPort: number;
  includeBuild: boolean;
}): string[] {
  const port = servicePort(input.service, input.defaultPort);
  const env = serviceEnvironment(input.service);
  const command = serviceCommand(input.service);
  const lines = [
    `  ${yamlQuoted(input.service.name)}:`,
    `    image: ${yamlQuoted(input.image)}`,
  ];

  if (input.includeBuild) {
    lines.push("    build:", "      context: ..", `      dockerfile: ${yamlQuoted(input.dockerfilePath)}`);
  }

  if (command) {
    lines.push(`    command: ${yamlQuoted(command)}`);
  }

  if (port) {
    lines.push("    expose:", `      - ${yamlQuoted(String(port))}`);
  }

  if (Object.keys(env).length > 0) {
    lines.push(
      "    environment:",
      ...Object.entries(env)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, value]) => `      ${yamlQuoted(key)}: ${yamlQuoted(value)}`),
    );
  }

  if (input.service.replicas && input.service.replicas > 1) {
    lines.push("    deploy:", `      replicas: ${input.service.replicas}`);
  }

  return lines;
}

export function renderServiceGraphCompose(input: RenderServiceGraphComposeInput): string {
  const services = [...input.services].sort((left, right) => left.name.localeCompare(right.name));
  return [
    "services:",
    ...services.flatMap((service, index) =>
      renderService({
        service,
        image: input.image,
        dockerfilePath: input.dockerfilePath,
        defaultPort: input.defaultPort,
        includeBuild: index === 0,
      }),
    ),
    "",
  ].join("\n");
}

export function renderReplicatedWorkloadCompose(input: RenderReplicatedWorkloadComposeInput): string {
  const lines = [
    "services:",
    `  ${yamlQuoted(input.serviceName)}:`,
    `    image: ${yamlQuoted(input.image)}`,
  ];

  if (input.includeBuild && input.dockerfilePath) {
    lines.push("    build:", "      context: ..", `      dockerfile: ${yamlQuoted(input.dockerfilePath)}`);
  }

  if (input.command) {
    lines.push(`    command: ${yamlQuoted(input.command)}`);
  }

  if (input.defaultPort) {
    lines.push("    expose:", `      - ${yamlQuoted(String(input.defaultPort))}`);
  }

  lines.push("    deploy:", `      replicas: ${input.replicas}`, "");

  return lines.join("\n");
}

export function serviceGraphComposeFileFromMetadata(
  metadata: Record<string, string> | undefined,
): string | undefined {
  return metadata?.["serviceGraph.composeFile"];
}

export function serviceGraphComposeServicesFromMetadata(
  metadata: Record<string, string> | undefined,
): RequestedDeploymentServiceConfig[] {
  const value = metadata?.["serviceGraph.services"];
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as RequestedDeploymentServiceConfig[]) : [];
  } catch {
    return [];
  }
}

export function replicatedWorkloadComposeFileFromMetadata(
  metadata: Record<string, string> | undefined,
): string | undefined {
  return metadata?.["replicatedWorkload.composeFile"];
}

export function replicatedWorkloadServiceNameFromMetadata(
  metadata: Record<string, string> | undefined,
): string | undefined {
  return metadata?.["replicatedWorkload.serviceName"];
}

export function replicatedWorkloadReplicasFromMetadata(
  metadata: Record<string, string> | undefined,
): number | undefined {
  const value = Number(metadata?.["replicatedWorkload.replicas"]);
  return Number.isInteger(value) && value > 1 ? value : undefined;
}

export { generatedReplicatedWorkloadComposeFile, generatedServiceGraphComposeFile };
