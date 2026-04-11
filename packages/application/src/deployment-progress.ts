import { type DeploymentLogSource, type LogLevel } from "@yundu/core";
import { type ExecutionContext } from "./execution-context";
import {
  type DeploymentProgressEvent,
  type DeploymentProgressPhase,
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
    source?: DeploymentLogSource;
    status?: DeploymentProgressStatus;
    stream?: "stdout" | "stderr";
    step?: {
      current: number;
      total: number;
      label: string;
    };
  },
): void {
  const event: DeploymentProgressEvent = {
    timestamp: new Date().toISOString(),
    source: input.source ?? "yundu",
    phase: input.phase,
    level: input.level ?? (input.status === "failed" ? "error" : "info"),
    message: input.message,
    ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.stream ? { stream: input.stream } : {}),
    step: input.step ?? deploymentProgressSteps[input.phase],
  };

  reporter.report(context, event);
}
