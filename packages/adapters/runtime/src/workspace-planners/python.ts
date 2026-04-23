import { err, ok, type Result, type SourceInspectionSnapshot } from "@appaloft/core";
import {
  commandMentions,
  dockerfileFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type GeneratedDockerBuildResult,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

export type PythonPackageManager = "pip" | "poetry" | "uv";

export function resolvePythonPackageManager(
  inspection?: SourceInspectionSnapshot,
): PythonPackageManager {
  const packageManager = inspection?.packageManager;

  if (packageManager === "uv" || packageManager === "poetry" || packageManager === "pip") {
    return packageManager;
  }

  if (inspection?.hasDetectedFile("uv-lock")) {
    return "uv";
  }

  if (inspection?.hasDetectedFile("poetry-lock")) {
    return "poetry";
  }

  return "pip";
}

export function pythonBaseImage(inspection?: SourceInspectionSnapshot): string {
  const version = inspection?.runtimeVersion ?? "3.12";
  return `python:${version}-slim`;
}

export function pythonInstallCommand(input: WorkspacePlannerInput): string | undefined {
  const packageManager = resolvePythonPackageManager(input.source.inspection);

  return (
    input.requestedDeployment.installCommand ??
    (packageManager === "uv"
      ? "pip install --no-cache-dir uv && uv sync --frozen --no-dev"
      : packageManager === "poetry"
        ? "pip install --no-cache-dir poetry && poetry install --only main --no-root"
        : input.source.inspection?.hasDetectedFile("requirements-txt")
          ? "pip install --no-cache-dir -r requirements.txt"
          : input.source.inspection?.hasDetectedFile("pyproject-toml")
            ? "pip install --no-cache-dir ."
            : undefined)
  );
}

export function pythonRunCommandFor(
  packageManager: PythonPackageManager,
  command: string,
): string {
  switch (packageManager) {
    case "uv":
      return `uv run ${command}`;
    case "poetry":
      return `poetry run ${command}`;
    case "pip":
      return command;
  }
}

export function pythonDockerBuild(
  input: WorkspaceDockerfileInput,
): GeneratedDockerBuildResult | null {
  const dockerfile = dockerfileFromExecution({
    baseImage:
      input.execution.metadata?.["workspace.baseImage"] ?? pythonBaseImage(input.sourceInspection),
    execution: input.execution,
    env: {
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
    },
  });

  if (!dockerfile) {
    return null;
  }

  return {
    dockerfile,
    contextAssets: [],
  };
}

export function pythonDockerfile(input: WorkspaceDockerfileInput): string | null {
  return pythonDockerBuild(input)?.dockerfile ?? null;
}

export const pythonWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "python",
  runtimeKind: "python",

  detect(input) {
    return Boolean(
      input.source.inspection?.runtimeFamily === "python" ||
        input.source.inspection?.hasDetectedFile("requirements-txt") ||
        input.source.inspection?.hasDetectedFile("pyproject-toml") ||
        commandMentions(input, ["python", "pip", "uvicorn", "gunicorn", "fastapi"]),
    );
  },

  plan(input): Result<WorkspaceRuntimePlan> {
    const startCommand = requiredStartCommand(input);

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = pythonBaseImage(input.source.inspection);
    const installCommand = pythonInstallCommand(input);
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
    return pythonDockerBuild(input);
  },
};
