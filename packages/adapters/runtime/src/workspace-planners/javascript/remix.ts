import { err, ok, type Result, type SourceInspectionSnapshot } from "@appaloft/core";
import {
  dockerfileFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "../types";
import { resolveNodePackageManager, type NodePackageManager } from "../node";

function installCommandFor(packageManager: NodePackageManager): string {
  switch (packageManager) {
    case "bun":
      return "bun install";
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install --frozen-lockfile";
    case "npm":
      return "npm install";
  }
}

function runCommandFor(packageManager: NodePackageManager, script: string): string {
  switch (packageManager) {
    case "bun":
      return `bun run ${script}`;
    case "pnpm":
      return `pnpm ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "npm":
      return `npm run ${script}`;
  }
}

function remixBaseImage(inspection?: SourceInspectionSnapshot): string {
  if (inspection?.packageManager === "bun") {
    return "oven/bun:1-alpine";
  }

  return `node:${inspection?.runtimeVersion ?? "22"}-alpine`;
}

function remixStartCommand(
  input: WorkspacePlannerInput,
  packageManager: NodePackageManager,
): string | undefined {
  return (
    input.requestedDeployment.startCommand ??
    (input.source.inspection?.hasDetectedScript("start")
      ? runCommandFor(packageManager, "start")
      : undefined)
  );
}

function remixBuildCommand(
  input: WorkspacePlannerInput,
  packageManager: NodePackageManager,
): string | undefined {
  return (
    input.requestedDeployment.buildCommand ??
    (input.source.inspection?.hasDetectedScript("build")
      ? runCommandFor(packageManager, "build")
      : undefined)
  );
}

export const remixWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "remix",
  runtimeKind: "remix",

  detect(input) {
    return input.source.inspection?.framework === "remix";
  },

  plan(input): Result<WorkspaceRuntimePlan> {
    const packageManager = resolveNodePackageManager(input.source.inspection);
    const startCommand = requiredStartCommand(input, remixStartCommand(input, packageManager));

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = remixBaseImage(input.source.inspection);
    const installCommand =
      input.requestedDeployment.installCommand ??
      (input.source.inspection?.hasDetectedFile("package-json")
        ? installCommandFor(packageManager)
        : undefined);
    const buildCommand = remixBuildCommand(input, packageManager);

    return ok({
      planner: this.name,
      runtimeKind: this.runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      applicationShape: "ssr",
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      startCommand: startCommand.value,
      metadata: workspaceMetadata({
        planner: this.name,
        runtimeKind: this.runtimeKind,
        baseImage,
        applicationShape: "ssr",
        extra: {
          packageManager,
          framework: "remix",
          ...(input.source.inspection?.projectName
            ? { projectName: input.source.inspection.projectName }
            : {}),
        },
      }),
    });
  },

  dockerfile(input: WorkspaceDockerfileInput): string | null {
    const baseImage =
      input.execution.metadata?.["workspace.baseImage"] ?? remixBaseImage(input.sourceInspection);

    return dockerfileFromExecution({
      baseImage,
      execution: input.execution,
      ...(baseImage.startsWith("node:")
        ? { beforeCopyRunCommands: ["corepack enable || true"] }
        : {}),
    });
  },
};
