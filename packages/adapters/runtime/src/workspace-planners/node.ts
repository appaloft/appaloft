import { err, ok, type Result, type SourceInspectionSnapshot } from "@yundu/core";
import {
  commandMentions,
  dockerfileFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

export type NodePackageManager = "bun" | "npm" | "pnpm";

export function resolveNodePackageManager(inspection?: SourceInspectionSnapshot): NodePackageManager {
  const packageManager = inspection?.packageManager;

  if (packageManager === "bun" || packageManager === "pnpm" || packageManager === "npm") {
    return packageManager;
  }

  return "npm";
}

function installCommandFor(packageManager: NodePackageManager): string {
  switch (packageManager) {
    case "bun":
      return "bun install";
    case "pnpm":
      return "pnpm install";
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
    case "npm":
      return `npm run ${script}`;
  }
}

function nodeBaseImage(inspection?: SourceInspectionSnapshot): string {
  if (inspection?.packageManager === "bun") {
    return "oven/bun:1-alpine";
  }

  const version = inspection?.runtimeVersion ?? "22";
  return `node:${version}-alpine`;
}

function nodeStartCommand(input: WorkspacePlannerInput, packageManager: NodePackageManager): string | undefined {
  return (
    input.requestedDeployment.startCommand ??
    (input.source.inspection?.hasDetectedScript("start-built")
      ? runCommandFor(packageManager, "start:built")
      : input.source.inspection?.hasDetectedScript("start")
        ? runCommandFor(packageManager, "start")
        : undefined)
  );
}

function nodeBuildCommand(input: WorkspacePlannerInput, packageManager: NodePackageManager): string | undefined {
  return (
    input.requestedDeployment.buildCommand ??
    (input.source.inspection?.hasDetectedScript("build") ? runCommandFor(packageManager, "build") : undefined)
  );
}

function nodeInstallCommand(input: WorkspacePlannerInput, packageManager: NodePackageManager): string | undefined {
  return (
    input.requestedDeployment.installCommand ??
    (input.source.inspection?.hasDetectedFile("package-json") ? installCommandFor(packageManager) : undefined)
  );
}

export const nodeWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "node",
  runtimeKind: "node",

  detect(input) {
    const inspection = input.source.inspection;
    return Boolean(
      inspection?.runtimeFamily === "node" ||
        inspection?.hasDetectedFile("package-json") ||
        commandMentions(input, ["node", "npm", "pnpm", "bun"]),
    );
  },

  plan(input): Result<WorkspaceRuntimePlan> {
    const packageManager = resolveNodePackageManager(input.source.inspection);
    const startCommand = requiredStartCommand(input, nodeStartCommand(input, packageManager));

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = nodeBaseImage(input.source.inspection);
    const installCommand = nodeInstallCommand(input, packageManager);
    const buildCommand = nodeBuildCommand(input, packageManager);

    return ok({
      planner: this.name,
      runtimeKind: this.runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      startCommand: startCommand.value,
      metadata: workspaceMetadata({
        planner: this.name,
        runtimeKind: this.runtimeKind,
        baseImage,
        extra: {
          packageManager,
        },
      }),
    });
  },

  dockerfile(input: WorkspaceDockerfileInput): string | null {
    const baseImage = input.execution.metadata?.["workspace.baseImage"] ?? nodeBaseImage(input.sourceInspection);

    return dockerfileFromExecution({
      baseImage,
      execution: input.execution,
      ...(baseImage.startsWith("node:")
        ? { beforeCopyRunCommands: ["corepack enable || true"] }
        : {}),
    });
  },
};
