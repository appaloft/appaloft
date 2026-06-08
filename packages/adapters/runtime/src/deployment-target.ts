import {
  type Deployment,
  type DeploymentState,
  type ServerBackedDeploymentState,
} from "@appaloft/core";

export function requireServerBackedDeploymentState(
  deployment: Deployment,
  operation: string,
): ServerBackedDeploymentState {
  return requireServerBackedDeploymentStateFromState(deployment.toState(), operation);
}

export function requireServerBackedDeploymentStateFromState(
  state: DeploymentState,
  operation: string,
): ServerBackedDeploymentState {
  const target = state.target.toState();
  if (target.kind === "server-backed" && state.serverId && state.destinationId) {
    return state as ServerBackedDeploymentState;
  }

  throw new Error(
    `${operation} requires a server-backed deployment target; received ${target.kind}`,
  );
}
