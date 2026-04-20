import { err, ok, type Result } from "@appaloft/core";
import {
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimeKind,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "../types";
import {
  pythonBaseImage,
  pythonDockerfile,
  pythonInstallCommand,
  pythonRunCommandFor,
  resolvePythonPackageManager,
  type PythonPackageManager,
} from "../python";

type PythonWebFramework = Extract<WorkspaceRuntimeKind, "django" | "fastapi" | "flask">;

interface PythonWebFrameworkDefaults {
  framework: PythonWebFramework;
  startCommand(input: WorkspacePlannerInput, packageManager: PythonPackageManager): string;
}

function runtimePort(input: WorkspacePlannerInput): number {
  return input.requestedDeployment.port ?? 3000;
}

const pythonWebFrameworkDefaults: Record<PythonWebFramework, PythonWebFrameworkDefaults> = {
  django: {
    framework: "django",
    startCommand(input, packageManager) {
      return pythonRunCommandFor(
        packageManager,
        `python manage.py runserver 0.0.0.0:${runtimePort(input)}`,
      );
    },
  },
  fastapi: {
    framework: "fastapi",
    startCommand(input, packageManager) {
      return pythonRunCommandFor(
        packageManager,
        `python -m uvicorn main:app --host 0.0.0.0 --port ${runtimePort(input)}`,
      );
    },
  },
  flask: {
    framework: "flask",
    startCommand(input, packageManager) {
      return pythonRunCommandFor(
        packageManager,
        `python -m flask run --host 0.0.0.0 --port ${runtimePort(input)}`,
      );
    },
  },
};

function createPythonWebFrameworkPlanner(
  defaults: PythonWebFrameworkDefaults,
): WorkspaceRuntimePlanner {
  return {
    name: defaults.framework,
    runtimeKind: defaults.framework,

    detect(input) {
      return input.source.inspection?.framework === defaults.framework;
    },

    plan(input): Result<WorkspaceRuntimePlan> {
      const packageManager = resolvePythonPackageManager(input.source.inspection);
      const startCommand = requiredStartCommand(
        input,
        defaults.startCommand(input, packageManager),
      );

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
            packageManager,
            framework: defaults.framework,
            ...(input.source.inspection?.projectName
              ? { projectName: input.source.inspection.projectName }
              : {}),
          },
        }),
      });
    },

    dockerfile(input: WorkspaceDockerfileInput): string | null {
      return pythonDockerfile(input);
    },
  };
}

export const fastapiWorkspacePlanner = createPythonWebFrameworkPlanner(
  pythonWebFrameworkDefaults.fastapi,
);
export const djangoWorkspacePlanner = createPythonWebFrameworkPlanner(
  pythonWebFrameworkDefaults.django,
);
export const flaskWorkspacePlanner = createPythonWebFrameworkPlanner(
  pythonWebFrameworkDefaults.flask,
);
