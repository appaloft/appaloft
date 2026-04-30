import { existsSync } from "node:fs";
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
  discoverPythonAppTargets,
  formatPythonAppTarget,
  pythonAppTargetValidationError,
  pythonBaseImage,
  pythonDockerBuild,
  pythonInstallCommand,
  pythonRunCommandFor,
  resolvePythonPackageManager,
  type PythonPackageManager,
} from "../python";

type PythonWebFramework = Extract<WorkspaceRuntimeKind, "django" | "fastapi" | "flask">;

interface PythonWebFrameworkDefaults {
  framework: PythonWebFramework;
  startCommand(input: WorkspacePlannerInput, packageManager: PythonPackageManager): Result<string>;
}

function runtimePort(input: WorkspacePlannerInput): number {
  return input.requestedDeployment.port ?? 3000;
}

function onePythonTarget(input: {
  sourceRoot: string;
  protocol: "asgi" | "wsgi";
  inspection: WorkspacePlannerInput["source"]["inspection"];
}): Result<string> {
  const discovery = discoverPythonAppTargets(input.sourceRoot);
  const targets = discovery[input.protocol];

  if (targets.length === 1) {
    const target = targets[0];
    if (target) {
      return ok(formatPythonAppTarget(target));
    }
  }

  if (targets.length > 1) {
    return err(
      pythonAppTargetValidationError({
        message: "Python app target is ambiguous. Configure an explicit production start command.",
        reasonCode: "ambiguous-python-app-target",
        inspection: input.inspection,
        protocol: input.protocol,
        targets,
      }),
    );
  }

  return err(
    pythonAppTargetValidationError({
      message: `Python ${input.protocol.toUpperCase()} app target is missing. Configure an explicit production start command.`,
      reasonCode: input.protocol === "asgi" ? "missing-asgi-app" : "missing-wsgi-app",
      inspection: input.inspection,
      protocol: input.protocol,
    }),
  );
}

const pythonWebFrameworkDefaults: Record<PythonWebFramework, PythonWebFrameworkDefaults> = {
  django: {
    framework: "django",
    startCommand(input, packageManager) {
      if (!input.source.inspection?.hasDetectedFile("django-manage")) {
        return err(
          pythonAppTargetValidationError({
            message: "Django project module is missing manage.py. Configure an explicit production start command.",
            reasonCode: "missing-wsgi-app",
            inspection: input.source.inspection,
            protocol: "wsgi",
          }),
        );
      }

      return ok(
        pythonRunCommandFor(
          packageManager,
          `python manage.py runserver 0.0.0.0:${runtimePort(input)}`,
        ),
      );
    },
  },
  fastapi: {
    framework: "fastapi",
    startCommand(input, packageManager) {
      if (!existsSync(input.source.locator)) {
        return ok(
          pythonRunCommandFor(
            packageManager,
            `python -m uvicorn main:app --host 0.0.0.0 --port ${runtimePort(input)}`,
          ),
        );
      }

      const target = onePythonTarget({
        sourceRoot: input.source.locator,
        protocol: "asgi",
        inspection: input.source.inspection,
      });

      if (target.isErr()) {
        return err(target.error);
      }

      return ok(
        pythonRunCommandFor(
          packageManager,
          `python -m uvicorn ${target.value} --host 0.0.0.0 --port ${runtimePort(input)}`,
        ),
      );
    },
  },
  flask: {
    framework: "flask",
    startCommand(input, packageManager) {
      if (!existsSync(input.source.locator)) {
        return ok(
          pythonRunCommandFor(
            packageManager,
            `python -m flask --app app:app run --host 0.0.0.0 --port ${runtimePort(input)}`,
          ),
        );
      }

      const hasDefaultFlaskApp = discoverPythonAppTargets(input.source.locator).asgi.some(
        (target) => target.module === "app" && target.object === "app",
      );

      if (!hasDefaultFlaskApp) {
        return err(
          pythonAppTargetValidationError({
            message: "Flask app target is missing. Configure an explicit production start command.",
            reasonCode: "missing-wsgi-app",
            inspection: input.source.inspection,
            protocol: "wsgi",
          }),
        );
      }

      return ok(
        pythonRunCommandFor(
          packageManager,
          `python -m flask --app app:app run --host 0.0.0.0 --port ${runtimePort(input)}`,
        ),
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
      const defaultStartCommand = defaults.startCommand(input, packageManager);
      if (defaultStartCommand.isErr() && !input.requestedDeployment.startCommand) {
        return err(defaultStartCommand.error);
      }

      const startCommand = requiredStartCommand(
        input,
        defaultStartCommand.isOk() ? defaultStartCommand.value : undefined,
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

    dockerBuild(input: WorkspaceDockerfileInput) {
      return pythonDockerBuild(input);
    },
  };
}

function createGenericPythonProtocolPlanner(input: {
  name: "generic-asgi" | "generic-wsgi";
  protocol: "asgi" | "wsgi";
  command(target: string, port: number): string;
}): WorkspaceRuntimePlanner {
  return {
    name: input.name,
    runtimeKind: input.name,

    detect(plannerInput) {
      if (
        plannerInput.source.inspection?.runtimeFamily !== "python" ||
        plannerInput.source.inspection.framework
      ) {
        return false;
      }

      return discoverPythonAppTargets(plannerInput.source.locator)[input.protocol].length > 0;
    },

    plan(plannerInput): Result<WorkspaceRuntimePlan> {
      const packageManager = resolvePythonPackageManager(plannerInput.source.inspection);
      const target = onePythonTarget({
        sourceRoot: plannerInput.source.locator,
        protocol: input.protocol,
        inspection: plannerInput.source.inspection,
      });

      if (target.isErr() && !plannerInput.requestedDeployment.startCommand) {
        return err(target.error);
      }

      const startCommand = requiredStartCommand(
        plannerInput,
        target.isOk()
          ? pythonRunCommandFor(
              packageManager,
              input.command(target.value, runtimePort(plannerInput)),
            )
          : undefined,
      );

      if (startCommand.isErr()) {
        return err(startCommand.error);
      }

      const baseImage = pythonBaseImage(plannerInput.source.inspection);
      const installCommand = pythonInstallCommand(plannerInput);
      const buildCommand = plannerInput.requestedDeployment.buildCommand;

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
            pythonAppProtocol: input.protocol,
            ...(target.isOk() ? { pythonAppTarget: target.value } : {}),
            ...(plannerInput.source.inspection?.projectName
              ? { projectName: plannerInput.source.inspection.projectName }
              : {}),
          },
        }),
      });
    },

    dockerBuild(input) {
      return pythonDockerBuild(input);
    },
  };
}

export const genericAsgiWorkspacePlanner = createGenericPythonProtocolPlanner({
  name: "generic-asgi",
  protocol: "asgi",
  command: (target, port) => `python -m uvicorn ${target} --host 0.0.0.0 --port ${port}`,
});

export const genericWsgiWorkspacePlanner = createGenericPythonProtocolPlanner({
  name: "generic-wsgi",
  protocol: "wsgi",
  command: (target, port) => `python -m gunicorn ${target} --bind 0.0.0.0:${port}`,
});

export const fastapiWorkspacePlanner = createPythonWebFrameworkPlanner(
  pythonWebFrameworkDefaults.fastapi,
);
export const djangoWorkspacePlanner = createPythonWebFrameworkPlanner(
  pythonWebFrameworkDefaults.django,
);
export const flaskWorkspacePlanner = createPythonWebFrameworkPlanner(
  pythonWebFrameworkDefaults.flask,
);
