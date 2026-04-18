import { type RequestedDeploymentConfig } from "@appaloft/application";
import {
  domainError,
  err,
  ok,
  type Result,
  type RuntimeExecutionPlan,
  type SourceDescriptor,
  type SourceInspectionSnapshot,
} from "@appaloft/core";

export {
  type DockerfileBuildContext,
  DockerfileBuilder,
  dockerfileFromExecution,
  renderStaticSiteDockerfile,
  renderWorkspaceDockerfile,
  type StaticSiteDockerfileContext,
  staticSiteDockerfileFromExecution,
} from "./dockerfile-builder";

export const generatedWorkspaceDockerfileName = "Dockerfile.appaloft";

export type WorkspaceRuntimeKind =
  | "custom"
  | "django"
  | "fastapi"
  | "flask"
  | "java"
  | "nextjs"
  | "node"
  | "python"
  | "remix";

export interface WorkspacePlannerInput {
  source: SourceDescriptor;
  requestedDeployment: RequestedDeploymentConfig;
}

export interface WorkspaceRuntimePlan {
  planner: string;
  runtimeKind: WorkspaceRuntimeKind;
  dockerfilePath: string;
  baseImage: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand: string;
  metadata: Record<string, string>;
}

export interface WorkspaceDockerfileInput {
  execution: RuntimeExecutionPlan;
  sourceInspection?: SourceInspectionSnapshot;
}

export interface WorkspaceRuntimePlanner {
  readonly name: string;
  readonly runtimeKind: WorkspaceRuntimeKind;
  detect(input: WorkspacePlannerInput): boolean;
  plan(input: WorkspacePlannerInput): Result<WorkspaceRuntimePlan>;
  dockerfile(input: WorkspaceDockerfileInput): string | null;
}

export function commandMentions(input: WorkspacePlannerInput, terms: readonly string[]): boolean {
  const commandText = [
    input.requestedDeployment.installCommand,
    input.requestedDeployment.buildCommand,
    input.requestedDeployment.startCommand,
  ]
    .filter((command): command is string => Boolean(command))
    .join("\n")
    .toLowerCase();

  return terms.some((term) => new RegExp(`\\b${term}\\b`, "u").test(commandText));
}

export function requiredStartCommand(
  input: WorkspacePlannerInput,
  fallback?: string,
): Result<string> {
  const command = input.requestedDeployment.startCommand ?? fallback;

  if (!command) {
    return err(
      domainError.validation(
        "Workspace command deployments require a start command or detected runtime start script",
      ),
    );
  }

  return ok(command);
}

export function workspaceMetadata(input: {
  planner: string;
  runtimeKind: WorkspaceRuntimeKind;
  baseImage: string;
  extra?: Record<string, string>;
}): Record<string, string> {
  return {
    "workspace.planner": input.planner,
    "workspace.runtime": input.runtimeKind,
    "workspace.baseImage": input.baseImage,
    ...(input.extra ?? {}),
  };
}
