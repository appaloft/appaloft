import { type PortNumber } from "../shared/numeric-values";
import {
  type CommandText,
  type ConfigKey,
  type ConfigValueText,
  type DisplayNameText,
  type FilePathText,
  type ImageReference,
} from "../shared/text-values";

export type RuntimeCommandKind =
  | "command-sequence"
  | "process-exec"
  | "shell-script"
  | "docker-build-image"
  | "docker-run-container"
  | "docker-compose-up"
  | "docker-remove-container"
  | "docker-remove-resource-containers"
  | "docker-inspect"
  | "docker-logs";

export type RuntimeCommandSequenceOperator = "and";

export interface RuntimeCommandSequenceSpec {
  kind: "command-sequence";
  operator: RuntimeCommandSequenceOperator;
  commands: readonly RuntimeCommandSpec[];
}

export interface ProcessExecCommandSpec {
  kind: "process-exec";
  executable: CommandText;
  args: readonly CommandText[];
  workingDirectory?: FilePathText;
}

export interface ShellScriptCommandSpec {
  kind: "shell-script";
  script: CommandText;
  workingDirectory?: FilePathText;
}

export interface RuntimeCommandEnvironmentVariable {
  name: ConfigKey;
  value: ConfigValueText;
  redacted?: boolean;
}

export interface RuntimeCommandLabel {
  name: DisplayNameText;
  value: CommandText;
}

export type DockerPortPublishMode = "loopback-ephemeral" | "host-same-port";

export interface DockerPublishedPortSpec {
  containerPort: PortNumber;
  mode: DockerPortPublishMode;
}

export interface DockerBuildImageCommandSpec {
  kind: "docker-build-image";
  image: ImageReference;
  dockerfilePath: FilePathText;
  contextPath: FilePathText;
  workingDirectory?: FilePathText;
}

export interface DockerRunContainerCommandSpec {
  kind: "docker-run-container";
  image: ImageReference;
  containerName: DisplayNameText;
  detach: boolean;
  env: readonly RuntimeCommandEnvironmentVariable[];
  labels: readonly RuntimeCommandLabel[];
  publishedPorts: readonly DockerPublishedPortSpec[];
  networkName?: DisplayNameText;
}

export interface DockerComposeUpCommandSpec {
  kind: "docker-compose-up";
  composeFile: FilePathText;
  workingDirectory?: FilePathText;
  detach: boolean;
  build: boolean;
}

export interface DockerRemoveContainerCommandSpec {
  kind: "docker-remove-container";
  containerName: DisplayNameText;
  force: boolean;
  ignoreMissing: boolean;
}

export interface DockerRemoveResourceContainersCommandSpec {
  kind: "docker-remove-resource-containers";
  resourceId: DisplayNameText;
  currentContainerName: DisplayNameText;
}

export interface DockerInspectCommandSpec {
  kind: "docker-inspect";
  containerName: DisplayNameText;
  format?: CommandText;
}

export interface DockerLogsCommandSpec {
  kind: "docker-logs";
  containerName: DisplayNameText;
  tail?: number;
}

export type RuntimeCommandSpec =
  | RuntimeCommandSequenceSpec
  | ProcessExecCommandSpec
  | ShellScriptCommandSpec
  | DockerBuildImageCommandSpec
  | DockerRunContainerCommandSpec
  | DockerComposeUpCommandSpec
  | DockerRemoveContainerCommandSpec
  | DockerRemoveResourceContainersCommandSpec
  | DockerInspectCommandSpec
  | DockerLogsCommandSpec;
