import { domainError, err, ok, type Result, type SourceInspectionSnapshot } from "@appaloft/core";
import {
  dockerBuildFromExecution,
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
import { pinnedBunAlpineImage } from "./bun";

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

function nextBaseImage(inspection?: SourceInspectionSnapshot): string {
  if (inspection?.packageManager === "bun") {
    return pinnedBunAlpineImage;
  }

  const version = inspection?.runtimeVersion ?? "22";
  return `node:${version}-alpine`;
}

type NextOutputMode = "server" | "standalone" | "custom-command";

function nextRouterEvidence(inspection?: SourceInspectionSnapshot): string {
  const routers = [
    ...(inspection?.hasDetectedFile("next-app-router") ? ["app-router"] : []),
    ...(inspection?.hasDetectedFile("next-pages-router") ? ["pages-router"] : []),
  ];

  return routers.length > 0 ? routers.join(",") : "unknown";
}

function hasConflictingNextOutputEvidence(inspection?: SourceInspectionSnapshot): boolean {
  return Boolean(
    inspection?.hasDetectedFile("next-standalone-output") &&
      inspection.hasDetectedFile("next-static-output"),
  );
}

function resolveNextOutputMode(input: WorkspacePlannerInput): Result<NextOutputMode> {
  if (
    hasConflictingNextOutputEvidence(input.source.inspection) &&
    !input.requestedDeployment.startCommand
  ) {
    return err(
      domainError.validation(
        "Next.js output evidence is ambiguous; provide explicit custom commands or select a static strategy",
        {
          phase: "runtime-plan-resolution",
          framework: "nextjs",
          detectedFiles: input.source.inspection?.detectedFiles.join(",") ?? "",
        },
      ),
    );
  }

  if (input.requestedDeployment.startCommand) {
    return ok("custom-command");
  }

  if (input.source.inspection?.hasDetectedFile("next-standalone-output")) {
    return ok("standalone");
  }

  return ok("server");
}

function defaultStartCommand(input: {
  packageManager: NodePackageManager;
  outputMode: NextOutputMode;
}): string {
  if (input.outputMode === "standalone") {
    return "node .next/standalone/server.js";
  }

  return runCommandFor(input.packageManager, "start");
}

export const nextjsWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "nextjs",
  runtimeKind: "nextjs",

  detect(input) {
    return input.source.inspection?.framework === "nextjs";
  },

  plan(input: WorkspacePlannerInput): Result<WorkspaceRuntimePlan> {
    const packageManager = resolveNodePackageManager(input.source.inspection);
    const outputMode = resolveNextOutputMode(input);

    if (outputMode.isErr()) {
      return err(outputMode.error);
    }

    const startCommand = requiredStartCommand(
      input,
      defaultStartCommand({ packageManager, outputMode: outputMode.value }),
    );

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = nextBaseImage(input.source.inspection);
    const routerEvidence = nextRouterEvidence(input.source.inspection);

    return ok({
      planner: this.name,
      runtimeKind: this.runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      applicationShape: "ssr",
      installCommand:
        input.requestedDeployment.installCommand ?? installCommandFor(packageManager),
      buildCommand:
        input.requestedDeployment.buildCommand ?? runCommandFor(packageManager, "build"),
      startCommand: startCommand.value,
      metadata: workspaceMetadata({
        planner: this.name,
        runtimeKind: this.runtimeKind,
        baseImage,
        applicationShape: "ssr",
        extra: {
          packageManager,
          framework: "nextjs",
          nextOutputMode: outputMode.value,
          nextRouterEvidence: routerEvidence,
        },
      }),
    });
  },

  dockerBuild(input: WorkspaceDockerfileInput) {
    const baseImage =
      input.execution.metadata?.["workspace.baseImage"] ?? nextBaseImage(input.sourceInspection);

    return dockerBuildFromExecution({
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
