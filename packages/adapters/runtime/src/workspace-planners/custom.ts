import { err, ok, type Result } from "@appaloft/core";
import {
  commandMentions,
  dockerBuildFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

function customBaseImage(): string {
  return "debian:bookworm-slim";
}

export const customWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "custom",
  runtimeKind: "custom",

  detect(input) {
    return Boolean(
      input.requestedDeployment.startCommand ||
        commandMentions(input, ["sh", "bash"]),
    );
  },

  plan(input): Result<WorkspaceRuntimePlan> {
    const startCommand = requiredStartCommand(input);

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = customBaseImage();
    const installCommand = input.requestedDeployment.installCommand;
    const buildCommand = input.requestedDeployment.buildCommand;

    return ok({
      planner: this.name,
      runtimeKind: this.runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      applicationShape: "serverful-http",
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      startCommand: startCommand.value,
      metadata: workspaceMetadata({
        planner: this.name,
        runtimeKind: this.runtimeKind,
        baseImage,
        applicationShape: "serverful-http",
      }),
    });
  },

  dockerBuild(input: WorkspaceDockerfileInput) {
    return dockerBuildFromExecution({
      baseImage: input.execution.metadata?.["workspace.baseImage"] ?? customBaseImage(),
      execution: input.execution,
    });
  },
};
