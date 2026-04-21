import type {
  DockerBuildImageCommandSpec,
  DockerComposeUpCommandSpec,
  DockerInspectCommandSpec,
  DockerLogsCommandSpec,
  DockerRemoveContainerCommandSpec,
  DockerRemoveResourceContainersCommandSpec,
  DockerRunContainerCommandSpec,
  ProcessExecCommandSpec,
  RenderedRuntimeCommand,
  RuntimeCommandEnvironmentVariable,
  RuntimeCommandRenderOptions,
  RuntimeCommandSpec,
  ShellScriptCommandSpec,
} from "./types";

export function renderRuntimeCommand(
  spec: RuntimeCommandSpec,
  options: RuntimeCommandRenderOptions,
): RenderedRuntimeCommand {
  return {
    kind: spec.kind,
    command: renderRuntimeCommandString(spec, options),
  };
}

export function renderRuntimeCommandString(
  spec: RuntimeCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  switch (spec.kind) {
    case "command-sequence":
      return spec.commands
        .map((command) => renderRuntimeCommandString(command, options))
        .filter((command) => command.length > 0)
        .join(" && ");
    case "process-exec":
      return withWorkingDirectory(
        renderProcessExecCommand(spec, options),
        spec.workingDirectory,
        options,
      );
    case "shell-script":
      return withWorkingDirectory(renderShellScriptCommand(spec), spec.workingDirectory, options);
    case "docker-build-image":
      return withWorkingDirectory(
        renderDockerBuildImageCommand(spec, options),
        spec.workingDirectory,
        options,
      );
    case "docker-run-container":
      return renderDockerRunContainerCommand(spec, options);
    case "docker-compose-up":
      return withWorkingDirectory(
        renderDockerComposeUpCommand(spec, options),
        spec.workingDirectory,
        options,
      );
    case "docker-remove-container":
      return renderDockerRemoveContainerCommand(spec, options);
    case "docker-remove-resource-containers":
      return renderDockerRemoveResourceContainersCommand(spec, options);
    case "docker-inspect":
      return renderDockerInspectCommand(spec, options);
    case "docker-logs":
      return renderDockerLogsCommand(spec, options);
  }
}

function renderProcessExecCommand(
  spec: ProcessExecCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  return [
    options.quote(spec.executable.value),
    ...spec.args.map((arg) => options.quote(arg.value)),
  ].join(" ");
}

function renderShellScriptCommand(spec: ShellScriptCommandSpec): string {
  return spec.script.value;
}

function renderDockerBuildImageCommand(
  spec: DockerBuildImageCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  return [
    "docker build",
    "-t",
    options.quote(spec.image.value),
    "-f",
    options.quote(spec.dockerfilePath.value),
    options.quote(spec.contextPath.value),
  ].join(" ");
}

function renderDockerRunContainerCommand(
  spec: DockerRunContainerCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  return [
    "docker run",
    spec.detach ? "-d" : "",
    "--name",
    options.quote(spec.containerName.value),
    spec.networkName ? `--network ${options.quote(spec.networkName.value)}` : "",
    ...spec.publishedPorts.map((port) => renderPublishedPort(port.mode, port.containerPort.value)),
    ...spec.env.map((variable) => renderEnvFlag(variable, options)),
    ...spec.labels.map((label) =>
      `--label ${options.quote(`${label.name.value}=${label.value.value}`)}`,
    ),
    options.quote(spec.image.value),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function renderDockerComposeUpCommand(
  spec: DockerComposeUpCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  return [
    "docker compose",
    "-f",
    options.quote(spec.composeFile.value),
    "up",
    spec.detach ? "-d" : "",
    spec.build ? "--build" : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function renderDockerRemoveContainerCommand(
  spec: DockerRemoveContainerCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  const command = [
    "docker rm",
    spec.force ? "-f" : "",
    options.quote(spec.containerName.value),
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  return spec.ignoreMissing ? `${command} >/dev/null 2>&1 || true` : command;
}

function renderDockerRemoveResourceContainersCommand(
  spec: DockerRemoveResourceContainersCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  if (spec.deploymentIds.length === 0) {
    return "";
  }

  const resourceLabelFilter = options.quote(`label=appaloft.resource-id=${spec.resourceId.value}`);
  return spec.deploymentIds
    .map((deploymentId) => {
      const deploymentLabelFilter = options.quote(
        `label=appaloft.deployment-id=${deploymentId.value}`,
      );
      return [
        `docker ps -aq --filter ${resourceLabelFilter} --filter ${deploymentLabelFilter}`,
        "| while read -r container_id; do",
        'docker rm -f "$container_id";',
        "done",
      ].join(" ");
    })
    .join(" && ");
}

function renderDockerInspectCommand(
  spec: DockerInspectCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  return [
    "docker inspect",
    spec.format ? `--format ${options.quote(spec.format.value)}` : "",
    options.quote(spec.containerName.value),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function renderDockerLogsCommand(
  spec: DockerLogsCommandSpec,
  options: RuntimeCommandRenderOptions,
): string {
  return [
    "docker logs",
    spec.tail ? `--tail ${options.quote(String(spec.tail))}` : "",
    options.quote(spec.containerName.value),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function renderEnvFlag(
  variable: RuntimeCommandEnvironmentVariable,
  options: RuntimeCommandRenderOptions,
): string {
  const value =
    options.mode === "display" && variable.redacted ? "[redacted]" : variable.value.value;
  return `-e ${options.quote(`${variable.name.value}=${value}`)}`;
}

function renderPublishedPort(
  mode: "loopback-ephemeral" | "host-same-port",
  containerPort: number,
): string {
  if (mode === "host-same-port") {
    return `-p ${containerPort}:${containerPort}`;
  }

  return `-p 127.0.0.1::${containerPort}`;
}

function withWorkingDirectory(
  command: string,
  workingDirectory: { value: string } | undefined,
  options: RuntimeCommandRenderOptions,
): string {
  return workingDirectory ? `cd ${options.quote(workingDirectory.value)} && ${command}` : command;
}
