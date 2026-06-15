import {
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  domainError,
  err,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  type Result,
  UpsertDeploymentSpec,
} from "@appaloft/core";

import { type ExecutionContext, toRepositoryContext } from "./execution-context";
import {
  type AppLogger,
  type DeploymentProgressEvent,
  type DeploymentProgressRecorder,
  type DeploymentRepository,
} from "./ports";

export class NoopDeploymentProgressRecorder implements DeploymentProgressRecorder {
  async record(): Promise<Result<void>> {
    return ok(undefined);
  }
}

export class DeploymentLogProgressRecorder implements DeploymentProgressRecorder {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly logger?: AppLogger,
  ) {}

  async record(context: ExecutionContext, event: DeploymentProgressEvent): Promise<Result<void>> {
    if (!event.deploymentId) {
      return ok(undefined);
    }

    const repositoryContext = toRepositoryContext(context);
    const deploymentId = DeploymentId.rehydrate(event.deploymentId);
    const deployment = await this.deploymentRepository.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(deploymentId),
    );

    if (!deployment) {
      return err(domainError.notFound("deployment", event.deploymentId));
    }

    const entry = DeploymentLogEntry.rehydrate({
      timestamp: OccurredAt.rehydrate(event.timestamp),
      source: DeploymentLogSourceValue.rehydrate(event.source),
      phase: DeploymentPhaseValue.rehydrate(event.phase),
      level: LogLevelValue.rehydrate(event.level),
      message: MessageText.rehydrate(event.message),
    });
    const entryState = entry.toState();

    const alreadyRecorded = deployment.toState().logs.some((candidate) => {
      return (
        candidate.timestamp === entry.timestamp &&
        candidate.source === entry.source &&
        candidate.phase === entry.phase &&
        candidate.level === entry.level &&
        candidate.message === entry.message
      );
    });

    if (alreadyRecorded) {
      return ok(undefined);
    }

    deployment.appendLogs([entry]);
    const updateResult = await this.deploymentRepository.updateOne(
      repositoryContext,
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    if (updateResult.isErr()) {
      this.logger?.warn("Failed to persist deployment progress event", {
        deploymentId: event.deploymentId,
        phase: event.phase,
        errorCode: updateResult.error.code,
      });
    }

    return updateResult;
  }
}
