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
  DockerRunContainerCommandSpec,
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
  env?: readonly DockerEnvironmentVariableInput[];
  labels?: readonly RuntimeCommandLabel[];
  publishedPorts?: readonly DockerPublishedPortSpec[];
  networkName?: string;
}

export interface DockerBuildImageInput {
  image: string;
  dockerfilePath: string;
  contextPath: string;
  workingDirectory?: string;
}

export interface DockerComposeUpInput {
  composeFile: string;
  projectName?: string;
  workingDirectory?: string;
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
      env: (input.env ?? []).map((variable): RuntimeCommandEnvironmentVariable => ({
        name: ConfigKey.rehydrate(variable.name),
        value: ConfigValueText.rehydrate(variable.value),
        ...(variable.redacted ? { redacted: variable.redacted } : {}),
      })),
      labels: input.labels ?? [],
      publishedPorts: input.publishedPorts ?? [],
      ...(input.networkName ? { networkName: DisplayNameText.rehydrate(input.networkName) } : {}),
    };
  }

  composeUp(input: DockerComposeUpInput): DockerComposeUpCommandSpec {
    return {
      kind: "docker-compose-up",
      composeFile: FilePathText.rehydrate(input.composeFile),
      ...(input.projectName ? { projectName: DisplayNameText.rehydrate(input.projectName) } : {}),
      ...(input.workingDirectory
        ? { workingDirectory: FilePathText.rehydrate(input.workingDirectory) }
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
  }): DockerPublishedPortSpec {
    return {
      containerPort: PortNumber.rehydrate(input.containerPort),
      mode: input.mode,
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
