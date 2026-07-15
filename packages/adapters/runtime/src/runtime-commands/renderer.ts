import type {
  DockerBuildImageCommandSpec,
  DockerComposeUpCommandSpec,
  DockerInspectCommandSpec,
  DockerLogsCommandSpec,
  DockerRemoveContainerCommandSpec,
  DockerRemoveResourceContainersCommandSpec,
  DockerRunContainerCommandSpec,
  DockerRunMountSpec,
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
    spec.pull ? "--pull" : "",
    spec.noCache ? "--no-cache" : "",
    "-t",
    options.quote(spec.image.value),
    "-f",
    options.quote(spec.dockerfilePath.value),
    ...spec.labels.map((label) =>
      `--label ${options.quote(`${label.name.value}=${label.value.value}`)}`,
    ),
    options.quote(spec.contextPath.value),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
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
    spec.restartPolicy ? `--restart ${options.quote(spec.restartPolicy)}` : "",
    spec.networkName ? `--network ${options.quote(spec.networkName.value)}` : "",
    ...spec.publishedPorts.map((port) =>
      renderPublishedPort(port.mode, port.containerPort.value, port.hostPort?.value),
    ),
    ...spec.mounts.map((mount) => renderMount(mount, options)),
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
  const composePrefix = [
    spec.portableDockerCompose === true ? "$appaloft_docker_compose_cmd" : "docker compose",
    spec.projectName ? `-p ${options.quote(spec.projectName.value)}` : "",
    "-f",
    options.quote(spec.composeFile.value),
    ...spec.additionalComposeFiles.flatMap((composeFile) => ["-f", options.quote(composeFile.value)]),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  const composeInvocation = [
    composePrefix,
    "up",
    spec.detach ? "-d" : "",
    spec.build ? "--build" : "",
    ...spec.scales.map((scale) =>
      `--scale ${options.quote(`${scale.serviceName.value}=${scale.replicas}`)}`,
    ),
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  const composeBuildInvocation =
    spec.build && (spec.pull || spec.noCache)
      ? [
          composePrefix,
          "build",
          spec.pull ? "--pull" : "",
          spec.noCache ? "--no-cache" : "",
        ]
          .filter((part) => part.length > 0)
          .join(" ")
      : undefined;
  const composePullInvocation = spec.pull
    ? `${composePrefix} pull --ignore-buildable`
    : undefined;
  const command = [composePullInvocation, composeBuildInvocation, composeInvocation]
    .filter((part): part is string => part !== undefined)
    .join(" && ");

  if (spec.portableDockerCompose !== true) {
    return command;
  }

  return [
    "{",
    "appaloft_docker_compose_cmd='';",
    `if docker compose -f ${options.quote(spec.composeFile.value)} config --services >/dev/null 2>&1; then appaloft_docker_compose_cmd='docker compose';`,
    `elif command -v docker-compose >/dev/null 2>&1 && docker-compose -f ${options.quote(spec.composeFile.value)} config --services >/dev/null 2>&1; then printf '%s\\n' 'Appaloft safe Compose deployment requires the supported docker compose v2/v5 CLI' >&2; exit 2;`,
    "else appaloft_docker_compose_cmd='docker compose'; fi;",
    command,
    ";",
    "}",
  ].join(" ");
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

function renderMount(mount: DockerRunMountSpec, options: RuntimeCommandRenderOptions): string {
  return [
    "--mount",
    [
      `type=${mount.type}`,
      `source=${options.quote(mount.source.value)}`,
      `target=${options.quote(mount.target.value)}`,
      mount.readOnly ? "readonly" : "",
    ]
      .filter((part) => part.length > 0)
      .join(","),
  ].join(" ");
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
  hostPort?: number,
): string {
  if (mode === "host-same-port") {
    return `-p ${hostPort ?? containerPort}:${containerPort}`;
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
