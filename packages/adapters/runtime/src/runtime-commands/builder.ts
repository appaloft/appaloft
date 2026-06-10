import {
  CommandText,
  ConfigKey,
  ConfigValueText,
  DisplayNameText,
  FilePathText,
  ImageReference,
  PortNumber,
} from "@appaloft/core";
import type {
  DockerBuildImageCommandSpec,
  DockerComposeUpCommandSpec,
  DockerPortPublishMode,
  DockerPublishedPortSpec,
  DockerRemoveContainerCommandSpec,
  DockerRemoveResourceContainersCommandSpec,
  DockerRestartPolicy,
  DockerRunContainerCommandSpec,
  DockerRunMountSpec,
  DockerRunMountType,
  RuntimeCommandEnvironmentVariable,
  RuntimeCommandLabel,
  RuntimeCommandSequenceSpec,
  RuntimeCommandSpec,
} from "./types";

export interface DockerEnvironmentVariableInput {
  name: string;
  value: string;
  redacted?: boolean;
}

export interface DockerRunContainerInput {
  image: string;
  containerName: string;
  detach?: boolean;
  restartPolicy?: DockerRestartPolicy;
  env?: readonly DockerEnvironmentVariableInput[];
  labels?: readonly RuntimeCommandLabel[];
  mounts?: readonly DockerRunMountInput[];
  publishedPorts?: readonly DockerPublishedPortSpec[];
  networkName?: string;
}

export interface DockerRunMountInput {
  type: DockerRunMountType;
  source: string;
  target: string;
  readOnly?: boolean;
}

export interface DockerBuildImageInput {
  image: string;
  dockerfilePath: string;
  contextPath: string;
  labels?: readonly RuntimeCommandLabel[];
  workingDirectory?: string;
}

export interface DockerComposeUpInput {
  composeFile: string;
  additionalComposeFiles?: readonly string[];
  scales?: readonly {
    serviceName: string;
    replicas: number;
  }[];
  projectName?: string;
  workingDirectory?: string;
  portableDockerCompose?: boolean;
  detach?: boolean;
  build?: boolean;
}

export class RuntimeCommandBuilder {
  static sequence(commands: readonly RuntimeCommandSpec[]): RuntimeCommandSequenceSpec {
    return {
      kind: "command-sequence",
      operator: "and",
      commands,
    };
  }

  static docker(): DockerCommandBuilder {
    return new DockerCommandBuilder();
  }
}

export class DockerCommandBuilder {
  buildImage(input: DockerBuildImageInput): DockerBuildImageCommandSpec {
    return {
      kind: "docker-build-image",
      image: ImageReference.rehydrate(input.image),
      dockerfilePath: FilePathText.rehydrate(input.dockerfilePath),
      contextPath: FilePathText.rehydrate(input.contextPath),
      labels: input.labels ?? [],
      ...(input.workingDirectory
        ? { workingDirectory: FilePathText.rehydrate(input.workingDirectory) }
        : {}),
    };
  }

  runContainer(input: DockerRunContainerInput): DockerRunContainerCommandSpec {
    return {
      kind: "docker-run-container",
      image: ImageReference.rehydrate(input.image),
      containerName: DisplayNameText.rehydrate(input.containerName),
      detach: input.detach ?? true,
      ...(input.restartPolicy ? { restartPolicy: input.restartPolicy } : {}),
      env: (input.env ?? []).map((variable): RuntimeCommandEnvironmentVariable => ({
        name: ConfigKey.rehydrate(variable.name),
        value: ConfigValueText.rehydrate(variable.value),
        ...(variable.redacted ? { redacted: variable.redacted } : {}),
      })),
      labels: input.labels ?? [],
      mounts: (input.mounts ?? []).map((mount): DockerRunMountSpec => ({
        type: mount.type,
        source:
          mount.type === "bind"
            ? FilePathText.rehydrate(mount.source)
            : DisplayNameText.rehydrate(mount.source),
        target: FilePathText.rehydrate(mount.target),
        readOnly: mount.readOnly ?? false,
      })),
      publishedPorts: input.publishedPorts ?? [],
      ...(input.networkName ? { networkName: DisplayNameText.rehydrate(input.networkName) } : {}),
    };
  }

  composeUp(input: DockerComposeUpInput): DockerComposeUpCommandSpec {
    return {
      kind: "docker-compose-up",
      composeFile: FilePathText.rehydrate(input.composeFile),
      additionalComposeFiles: (input.additionalComposeFiles ?? []).map((composeFile) =>
        FilePathText.rehydrate(composeFile),
      ),
      scales: (input.scales ?? []).map((scale) => ({
        serviceName: DisplayNameText.rehydrate(scale.serviceName),
        replicas: scale.replicas,
      })),
      ...(input.projectName ? { projectName: DisplayNameText.rehydrate(input.projectName) } : {}),
      ...(input.workingDirectory
        ? { workingDirectory: FilePathText.rehydrate(input.workingDirectory) }
        : {}),
      ...(input.portableDockerCompose
        ? { portableDockerCompose: input.portableDockerCompose }
        : {}),
      detach: input.detach ?? true,
      build: input.build ?? true,
    };
  }

  removeContainer(input: {
    containerName: string;
    force?: boolean;
    ignoreMissing?: boolean;
  }): DockerRemoveContainerCommandSpec {
    return {
      kind: "docker-remove-container",
      containerName: DisplayNameText.rehydrate(input.containerName),
      force: input.force ?? true,
      ignoreMissing: input.ignoreMissing ?? false,
    };
  }

  removeResourceContainers(input: {
    resourceId: string;
    deploymentIds: readonly string[];
  }): DockerRemoveResourceContainersCommandSpec {
    return {
      kind: "docker-remove-resource-containers",
      resourceId: DisplayNameText.rehydrate(input.resourceId),
      deploymentIds: input.deploymentIds.map((deploymentId) =>
        DisplayNameText.rehydrate(deploymentId),
      ),
    };
  }

  publishPort(input: {
    containerPort: number;
    mode: DockerPortPublishMode;
    hostPort?: number | undefined;
  }): DockerPublishedPortSpec {
    return {
      containerPort: PortNumber.rehydrate(input.containerPort),
      mode: input.mode,
      ...(input.hostPort ? { hostPort: PortNumber.rehydrate(input.hostPort) } : {}),
    };
  }
}

export function dockerLabelFromAssignment(assignment: string): RuntimeCommandLabel {
  const separatorIndex = assignment.indexOf("=");
  if (separatorIndex === -1) {
    return {
      name: DisplayNameText.rehydrate(assignment),
      value: CommandText.rehydrate(""),
    };
  }

  return {
    name: DisplayNameText.rehydrate(assignment.slice(0, separatorIndex)),
    value: CommandText.rehydrate(assignment.slice(separatorIndex + 1)),
  };
}

export function dockerLabelsFromAssignments(
  assignments: readonly string[],
): RuntimeCommandLabel[] {
  return assignments.map((assignment) => dockerLabelFromAssignment(assignment));
}
