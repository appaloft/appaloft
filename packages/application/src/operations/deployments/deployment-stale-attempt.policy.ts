import { type DeploymentStatus } from "@appaloft/core";
import { deploymentProofFingerprint } from "./deployment-proof-fingerprint";

export const defaultDeploymentStaleAfterSeconds = 900;
export const minimumDeploymentStaleAfterSeconds = 60;
export const maximumDeploymentStaleAfterSeconds = 86_400;

export interface DeploymentStaleAttemptState {
  id: string;
  status: DeploymentStatus;
  createdAt: string;
  startedAt?: string;
  timeline: readonly { timestamp: string }[];
}

const terminalStatuses = new Set<DeploymentStatus>([
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
  "rolled-back",
]);

export function isActiveDeploymentStatus(
  status: DeploymentStatus,
): status is "created" | "planning" | "planned" | "running" | "cancel-requested" {
  return !terminalStatuses.has(status);
}

export function deploymentLatestDurableActivityAt(state: DeploymentStaleAttemptState): string {
  const timestamps = [
    state.createdAt,
    ...(state.startedAt ? [state.startedAt] : []),
    ...state.timeline.map((entry) => entry.timestamp),
  ];
  return timestamps.reduce((latest, candidate) =>
    Date.parse(candidate) > Date.parse(latest) ? candidate : latest,
  );
}

export function deploymentStaleStateVersion(state: DeploymentStaleAttemptState): string {
  return deploymentProofFingerprint({
    deploymentId: state.id,
    status: state.status,
    latestActivityAt: deploymentLatestDurableActivityAt(state),
    timelineCount: state.timeline.length,
  });
}

export function observeDeploymentStaleness(
  state: DeploymentStaleAttemptState,
  input: { checkedAt: string; staleAfterSeconds: number },
) {
  const latestActivityAt = deploymentLatestDurableActivityAt(state);
  const staleForSeconds = Math.max(
    0,
    Math.floor((Date.parse(input.checkedAt) - Date.parse(latestActivityAt)) / 1000),
  );
  const terminal = !isActiveDeploymentStatus(state.status);
  return {
    terminal,
    stale: !terminal && staleForSeconds >= input.staleAfterSeconds,
    latestActivityAt,
    staleForSeconds,
    stateVersion: deploymentStaleStateVersion(state),
    runtimeCancellationRequired: state.status === "running" || state.status === "cancel-requested",
  };
}
