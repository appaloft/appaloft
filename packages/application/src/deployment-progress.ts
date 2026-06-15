import { type DeploymentTimelineJournalSource, type LogLevel } from "@appaloft/core";
import { type ExecutionContext } from "./execution-context";
import {
  type DeploymentProgressEvent,
  type DeploymentProgressPhase,
  type DeploymentProgressRecorder,
  type DeploymentProgressReporter,
  type DeploymentProgressStatus,
} from "./ports";

export const deploymentProgressSteps = {
  detect: { current: 1, total: 5, label: "Detect source" },
  plan: { current: 2, total: 5, label: "Build runtime plan" },
  package: { current: 3, total: 5, label: "Prepare package" },
  deploy: { current: 4, total: 5, label: "Start runtime" },
  verify: { current: 5, total: 5, label: "Verify health" },
  rollback: { current: 1, total: 1, label: "Rollback runtime" },
} as const satisfies Record<
  DeploymentProgressPhase,
  {
    current: number;
    total: number;
    label: string;
  }
>;

export function reportDeploymentProgress(
  reporter: DeploymentProgressReporter,
  context: ExecutionContext,
  input: {
    phase: DeploymentProgressPhase;
    message: string;
    deploymentId?: string;
    level?: LogLevel;
    source?: DeploymentTimelineJournalSource;
    status?: DeploymentProgressStatus;
    stream?: "stdout" | "stderr";
    step?: {
      current: number;
      total: number;
      label: string;
    };
  },
): void {
  reporter.report(context, createDeploymentProgressEvent(input));
}

export function createDeploymentProgressEvent(input: {
  phase: DeploymentProgressPhase;
  message: string;
  deploymentId?: string;
  level?: LogLevel;
  source?: DeploymentTimelineJournalSource;
  status?: DeploymentProgressStatus;
  stream?: "stdout" | "stderr";
  step?: {
    current: number;
    total: number;
    label: string;
  };
}): DeploymentProgressEvent {
  return {
    timestamp: new Date().toISOString(),
    source: input.source ?? "appaloft",
    phase: input.phase,
    level: input.level ?? (input.status === "failed" ? "error" : "info"),
    message: input.message,
    ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.stream ? { stream: input.stream } : {}),
    step: input.step ?? deploymentProgressSteps[input.phase],
  };
}

export async function recordDeploymentProgress(
  recorder: DeploymentProgressRecorder,
  reporter: DeploymentProgressReporter,
  context: ExecutionContext,
  input: Parameters<typeof createDeploymentProgressEvent>[0],
): Promise<void> {
  const event = createDeploymentProgressEvent(input);
  await recorder.record(context, event);
  reporter.report(context, event);
}
