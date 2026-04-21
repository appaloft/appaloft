import {
  type Deployment,
  type DeploymentId,
  DeploymentLogEntry,
  DeploymentPhaseValue,
  type DomainError,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  type Result,
  StartedAt,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type Clock } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeploymentLifecycleService {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  prepareForExecution(deployment: Deployment): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const planningAt = yield* StartedAt.create(clock.now());
      const markPlanningResult = deployment.markPlanning(planningAt);
      yield* markPlanningResult;

      const plannedAt = yield* StartedAt.create(clock.now());
      const markPlannedResult = deployment.markPlanned(plannedAt);
      yield* markPlannedResult;

      return ok(undefined);
    });
  }

  startExecution(deployment: Deployment): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const startedAt = yield* StartedAt.create(clock.now());
      const startResult = deployment.start(startedAt);
      yield* startResult;
      return ok(undefined);
    });
  }

  requestCancellationForSupersede(
    deployment: Deployment,
    supersededByDeploymentId: DeploymentId,
  ): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const requestedAt = yield* StartedAt.create(clock.now());
      const requestResult = deployment.requestCancellation(requestedAt, {
        supersededByDeploymentId,
      });
      yield* requestResult;
      return ok(undefined);
    });
  }

  cancelForSupersede(
    deployment: Deployment,
    supersededByDeploymentId: DeploymentId,
    logs: DeploymentLogEntry[] = [],
  ): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const finishedAt = yield* FinishedAt.create(clock.now());
      const cancelResult = deployment.cancel(finishedAt, logs, {
        supersededByDeploymentId,
      });
      yield* cancelResult;
      return ok(undefined);
    });
  }

  failExecution(deployment: Deployment, error: DomainError): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const finishedAt = yield* FinishedAt.create(clock.now());
      const phase =
        typeof error.details?.phase === "string" ? error.details.phase : "runtime-execution";
      const step = typeof error.details?.step === "string" ? error.details.step : phase;
      const result = ExecutionResult.rehydrate({
        status: ExecutionStatusValue.rehydrate("failed"),
        exitCode: ExitCode.rehydrate(1),
        retryable: error.retryable,
        errorCode: ErrorCodeText.rehydrate(error.code),
        logs: [
          DeploymentLogEntry.rehydrate({
            timestamp: OccurredAt.rehydrate(clock.now()),
            phase: DeploymentPhaseValue.rehydrate(logPhaseForFailurePhase(phase)),
            level: LogLevelValue.rehydrate("error"),
            message: MessageText.rehydrate(error.message),
          }),
        ],
        metadata: {
          ...metadataFromErrorDetails(error.details),
          phase,
          step,
          message: error.message,
        },
      });
      const applyResult = deployment.applyExecutionResult(finishedAt, result);
      yield* applyResult;
      return ok(undefined);
    });
  }
}

function metadataFromErrorDetails(details: DomainError["details"]): Record<string, string> {
  if (!details) {
    return {};
  }

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== null) {
      metadata[key] = String(value);
    }
  }
  return metadata;
}

function logPhaseForFailurePhase(
  phase: string,
): "detect" | "plan" | "package" | "deploy" | "verify" | "rollback" {
  if (
    phase === "source-detection" ||
    phase === "resource-source-resolution" ||
    phase === "detect"
  ) {
    return "detect";
  }

  if (
    phase === "runtime-plan-resolution" ||
    phase === "runtime-target-resolution" ||
    phase === "plan"
  ) {
    return "plan";
  }

  if (
    phase === "image-build" ||
    phase === "image-pull" ||
    phase === "runtime-artifact-resolution" ||
    phase === "package"
  ) {
    return "package";
  }

  if (phase === "public-route-verification" || phase === "verify") {
    return "verify";
  }

  if (phase === "rollback") {
    return "rollback";
  }

  return "deploy";
}
