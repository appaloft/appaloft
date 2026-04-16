import { domainError, err, type Result, type RuntimeExecutionPlan } from "@yundu/core";
import { customWorkspacePlanner } from "./custom";
import { javaWorkspacePlanner } from "./java";
import { nextjsWorkspacePlanner } from "./nextjs";
import { nodeWorkspacePlanner } from "./node";
import { pythonWorkspacePlanner } from "./python";
import {
  DockerfileBuilder,
  generatedWorkspaceDockerfileName,
  renderWorkspaceDockerfile,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

export { DockerfileBuilder, generatedWorkspaceDockerfileName, renderWorkspaceDockerfile };

const workspaceRuntimePlanners: WorkspaceRuntimePlanner[] = [
  nextjsWorkspacePlanner,
  nodeWorkspacePlanner,
  pythonWorkspacePlanner,
  javaWorkspacePlanner,
  customWorkspacePlanner,
];

export function resolveWorkspaceRuntimePlan(
  input: WorkspacePlannerInput,
): Result<WorkspaceRuntimePlan> {
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
  return plannerForExecution(input.execution).dockerfile(input);
}
