import {
  type Deployment,
  type DeploymentState,
  domainError,
  err,
  ok,
  type Result,
  type ServerBackedDeploymentState,
} from "@appaloft/core";

export function requireServerBackedDeploymentState(
  deployment: Deployment,
  operation: string,
): Result<ServerBackedDeploymentState> {
  const state = deployment.toState();
  const target = state.target.toState();
  if (target.kind === "server-backed" && state.serverId && state.destinationId) {
    return ok(state as ServerBackedDeploymentState);
  }

  return err(
    domainError.validation("Deployment operation requires a server-backed target", {
      operation,
      deploymentId: state.id.value,
      resourceId: state.resourceId.value,
      targetKind: target.kind,
    }),
  );
}

export function isServerBackedDeploymentSummary(input: {
  readonly target?: { readonly kind: string };
  readonly serverId?: string;
  readonly destinationId?: string;
}): input is typeof input & {
  readonly target: { readonly kind: "server-backed" };
  readonly serverId: string;
  readonly destinationId: string;
} {
  return input.target?.kind === "server-backed" && Boolean(input.serverId && input.destinationId);
}

export function isServerBackedDeploymentState(
  state: DeploymentState,
): state is ServerBackedDeploymentState {
  return (
    state.target.toState().kind === "server-backed" &&
    Boolean(state.serverId && state.destinationId)
  );
}
