import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  domainError,
  err,
  ok,
  type Result,
  type SourceInspectionSnapshot,
} from "@appaloft/core";
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
export type PythonAppProtocol = "asgi" | "wsgi";

export interface PythonAppTarget {
  protocol: PythonAppProtocol;
  module: string;
  object: string;
}

export interface PythonAppTargetDiscovery {
  asgi: PythonAppTarget[];
  wsgi: PythonAppTarget[];
}

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

function readSourceFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function hasPythonObjectTarget(text: string | null, objectName: string): boolean {
  if (!text) {
    return false;
  }

  const escaped = objectName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(^|\\n)\\s*(?:async\\s+def\\s+${escaped}\\s*\\(|def\\s+${escaped}\\s*\\(|${escaped}\\s*=)`,
    "u",
  ).test(text);
}

function collectTargets(input: {
  sourceRoot: string;
  protocol: PythonAppProtocol;
  candidates: readonly string[];
}): PythonAppTarget[] {
  const targets: PythonAppTarget[] = [];

  for (const candidate of input.candidates) {
    const filePath = join(input.sourceRoot, candidate);
    if (!existsSync(filePath)) {
      continue;
    }

    const text = readSourceFile(filePath);
    const module = candidate.replace(/\.py$/u, "");

    for (const objectName of ["app", "application"]) {
      if (hasPythonObjectTarget(text, objectName)) {
        targets.push({
          protocol: input.protocol,
          module,
          object: objectName,
        });
      }
    }
  }

  return targets;
}

export function discoverPythonAppTargets(sourceRoot: string): PythonAppTargetDiscovery {
  return {
    asgi: collectTargets({
      sourceRoot,
      protocol: "asgi",
      candidates: ["asgi.py", "main.py", "app.py"],
    }),
    wsgi: collectTargets({
      sourceRoot,
      protocol: "wsgi",
      candidates: ["wsgi.py"],
    }),
  };
}

export function formatPythonAppTarget(target: PythonAppTarget): string {
  return `${target.module}:${target.object}`;
}

export function pythonAppTargetValidationError(input: {
  message: string;
  reasonCode: "ambiguous-python-app-target" | "missing-asgi-app" | "missing-wsgi-app";
  inspection?: SourceInspectionSnapshot | undefined;
  protocol?: PythonAppProtocol;
  targets?: PythonAppTarget[];
}) {
  return domainError.validation(input.message, {
    phase: "runtime-plan-resolution",
    reasonCode: input.reasonCode,
    ...(input.inspection?.runtimeFamily ? { runtimeFamily: input.inspection.runtimeFamily } : {}),
    ...(input.inspection?.framework ? { framework: input.inspection.framework } : {}),
    ...(input.inspection?.packageManager ? { packageManager: input.inspection.packageManager } : {}),
    ...(input.inspection?.applicationShape
      ? { applicationShape: input.inspection.applicationShape }
      : {}),
    ...(input.protocol ? { pythonAppProtocol: input.protocol } : {}),
    ...(input.targets && input.targets.length > 0
      ? { pythonAppTargets: input.targets.map(formatPythonAppTarget).join(",") }
      : {}),
  });
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
  name: "generic-python",
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
        extra: {
          packageManager: resolvePythonPackageManager(input.source.inspection),
        },
      }),
    });
  },

  dockerBuild(input: WorkspaceDockerfileInput) {
    return pythonDockerBuild(input);
  },
};
