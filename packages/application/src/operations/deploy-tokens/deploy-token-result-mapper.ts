import { type DeployTokenScope, type DeployTokenWorkflowCommand } from "@appaloft/core";

export interface DeployTokenScopeResult {
  deploymentTargetIds: string[];
  environmentIds: string[];
  projectIds: string[];
  repositoryFullNames: string[];
  resourceIds: string[];
  workflowCommands: DeployTokenWorkflowCommand[];
}

export function mapDeployTokenScope(scope: DeployTokenScope): DeployTokenScopeResult {
  const state = scope.toState();

  return {
    deploymentTargetIds: state.deploymentTargetIds.map((id) => id.value),
    environmentIds: state.environmentIds.map((id) => id.value),
    projectIds: state.projectIds.map((id) => id.value),
    repositoryFullNames: state.repositoryFullNames.map((repository) => repository.value),
    resourceIds: state.resourceIds.map((id) => id.value),
    workflowCommands: state.workflowCommands.map((command) => command.value),
  };
}
