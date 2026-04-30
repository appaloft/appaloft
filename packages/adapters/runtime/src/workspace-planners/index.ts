import { domainError, err, type Result, type RuntimeExecutionPlan } from "@appaloft/core";
import { customWorkspacePlanner } from "./custom";
import { javaWorkspacePlanner } from "./java";
import { remixWorkspacePlanner } from "./javascript/remix";
import { nextjsWorkspacePlanner } from "./nextjs";
import { nodeWorkspacePlanner } from "./node";
import { pythonWorkspacePlanner } from "./python";
import {
  djangoWorkspacePlanner,
  fastapiWorkspacePlanner,
  flaskWorkspacePlanner,
  genericAsgiWorkspacePlanner,
  genericWsgiWorkspacePlanner,
} from "./python/web-frameworks";
import {
  DockerfileBuilder,
  generatedWorkspaceDockerfileName,
  renderStaticSiteDockerBuild,
  renderStaticSiteDockerfile,
  renderWorkspaceDockerBuild,
  renderWorkspaceDockerfile,
  staticSiteDockerBuildFromExecution,
  staticSiteDockerfileFromExecution,
  type GeneratedDockerBuildResult,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

export {
  DockerfileBuilder,
  generatedWorkspaceDockerfileName,
  renderStaticSiteDockerBuild,
  renderStaticSiteDockerfile,
  renderWorkspaceDockerBuild,
  renderWorkspaceDockerfile,
};

const workspaceRuntimePlanners: WorkspaceRuntimePlanner[] = [
  nextjsWorkspacePlanner,
  remixWorkspacePlanner,
  nodeWorkspacePlanner,
  fastapiWorkspacePlanner,
  djangoWorkspacePlanner,
  flaskWorkspacePlanner,
  genericAsgiWorkspacePlanner,
  genericWsgiWorkspacePlanner,
  pythonWorkspacePlanner,
  javaWorkspacePlanner,
  customWorkspacePlanner,
];

export function resolveWorkspaceRuntimePlan(
  input: WorkspacePlannerInput,
): Result<WorkspaceRuntimePlan> {
  if (
    (input.source.inspection?.applicationShape === "hybrid-static-server" ||
      input.source.inspection?.framework === "sveltekit") &&
    !input.requestedDeployment.startCommand
  ) {
    return err(
      domainError.validation(
        "Hybrid static/server framework planning requires an explicit static strategy or start command",
        {
          phase: "runtime-plan-resolution",
          ...(input.source.inspection?.framework
            ? { framework: input.source.inspection.framework }
            : {}),
          applicationShape: "hybrid-static-server",
        },
      ),
    );
  }

  for (const planner of workspaceRuntimePlanners) {
    if (!planner.detect(input)) {
      continue;
    }

    return planner.plan(input);
  }

  return err(
    domainError.validation(
      "Could not detect a workspace runtime planner. Provide runtime metadata, a base image, or explicit workspace commands.",
    ),
  );
}

function plannerForExecution(execution: RuntimeExecutionPlan): WorkspaceRuntimePlanner {
  const plannerName = execution.metadata?.["workspace.planner"];
  return (
    workspaceRuntimePlanners.find((planner) => planner.name === plannerName) ??
    customWorkspacePlanner
  );
}

export function generateWorkspaceDockerfile(input: WorkspaceDockerfileInput): string | null {
  return generateWorkspaceDockerBuild(input)?.dockerfile ?? null;
}

export function generateWorkspaceDockerBuild(
  input: WorkspaceDockerfileInput,
): GeneratedDockerBuildResult | null {
  return plannerForExecution(input.execution).dockerBuild(input);
}

export function generateStaticSiteDockerfile(input: WorkspaceDockerfileInput): string | null {
  return generateStaticSiteDockerBuild(input)?.dockerfile ?? null;
}

export function generateStaticSiteDockerBuild(
  input: WorkspaceDockerfileInput,
): GeneratedDockerBuildResult | null {
  return staticSiteDockerBuildFromExecution(input);
}
