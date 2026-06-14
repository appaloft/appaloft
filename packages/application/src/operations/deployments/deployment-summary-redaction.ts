import { type DeploymentSummary } from "../../ports";

const secretMask = "********";

export function maskDeploymentEnvironmentSnapshot(
  snapshot: DeploymentSummary["environmentSnapshot"],
): DeploymentSummary["environmentSnapshot"] {
  return {
    ...snapshot,
    variables: snapshot.variables.map((variable) => ({
      ...variable,
      value: variable.isSecret || variable.kind === "secret" ? secretMask : variable.value,
    })),
  };
}

export function maskDeploymentSummarySecrets(deployment: DeploymentSummary): DeploymentSummary {
  return {
    ...deployment,
    environmentSnapshot: maskDeploymentEnvironmentSnapshot(deployment.environmentSnapshot),
  };
}

export function maskDeploymentLikeSummarySecrets<
  T extends { environmentSnapshot: DeploymentSummary["environmentSnapshot"] },
>(deployment: T): T {
  return {
    ...deployment,
    environmentSnapshot: maskDeploymentEnvironmentSnapshot(deployment.environmentSnapshot),
  };
}
