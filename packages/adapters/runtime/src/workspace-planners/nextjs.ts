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
} from "./types";
import {
  resolveNodePackageManager,
  type NodePackageManager,
} from "./node";

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

function nextBaseImage(inspection?: SourceInspectionSnapshot): string {
  if (inspection?.packageManager === "bun") {
    return "oven/bun:1-alpine";
  }

  const version = inspection?.runtimeVersion ?? "22";
  return `node:${version}-alpine`;
}

export const nextjsWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "nextjs",
  runtimeKind: "nextjs",

  detect(input) {
    return input.source.inspection?.framework === "nextjs";
  },

  plan(input: WorkspacePlannerInput): Result<WorkspaceRuntimePlan> {
    const packageManager = resolveNodePackageManager(input.source.inspection);
    const startCommand = requiredStartCommand(input, runCommandFor(packageManager, "start"));

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = nextBaseImage(input.source.inspection);

    return ok({
      planner: this.name,
      runtimeKind: this.runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      installCommand:
        input.requestedDeployment.installCommand ?? installCommandFor(packageManager),
      buildCommand:
        input.requestedDeployment.buildCommand ?? runCommandFor(packageManager, "build"),
      startCommand: startCommand.value,
      metadata: workspaceMetadata({
        planner: this.name,
        runtimeKind: this.runtimeKind,
        baseImage,
        extra: {
          packageManager,
          framework: "nextjs",
        },
      }),
    });
  },

  dockerfile(input: WorkspaceDockerfileInput): string | null {
    const baseImage =
      input.execution.metadata?.["workspace.baseImage"] ?? nextBaseImage(input.sourceInspection);

    return dockerfileFromExecution({
      baseImage,
      execution: input.execution,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
      },
      ...(baseImage.startsWith("node:")
        ? { beforeCopyRunCommands: ["corepack enable || true"] }
        : {}),
    });
  },
};
