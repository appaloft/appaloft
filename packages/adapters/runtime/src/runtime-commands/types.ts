import type { RuntimeCommandKind } from "@yundu/core";

export type {
  DockerBuildImageCommandSpec,
  DockerComposeUpCommandSpec,
  DockerInspectCommandSpec,
  DockerLogsCommandSpec,
  DockerPortPublishMode,
  DockerPublishedPortSpec,
  DockerRemoveContainerCommandSpec,
  DockerRemoveResourceContainersCommandSpec,
  DockerRunContainerCommandSpec,
  ProcessExecCommandSpec,
  RuntimeCommandEnvironmentVariable,
  RuntimeCommandKind,
  RuntimeCommandLabel,
  RuntimeCommandSequenceOperator,
  RuntimeCommandSequenceSpec,
  RuntimeCommandSpec,
  ShellScriptCommandSpec,
} from "@yundu/core";

export type RuntimeCommandRenderMode = "execute" | "display";

export interface RuntimeCommandRenderOptions {
  quote: (value: string) => string;
  mode?: RuntimeCommandRenderMode;
}

export interface RenderedRuntimeCommand {
  kind: RuntimeCommandKind;
  command: string;
}
