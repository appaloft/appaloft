import {
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  type Result,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import {
  type DurableWorkHandler,
  type DurableWorkHandlerResult,
  type DurableWorkItemRecord,
  type DurableWorkQueueAdapter,
  type DurableWorkWorkerIdentity,
} from "../../durable-work";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import {
  type AppLogger,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { recordDeploymentProcessAttempt } from "./deployment-process-attempt";

export const deploymentDurableWorkKind = "deployment";

export function deploymentDurableWorkItemId(deploymentId: string): string {
  return `dw_deployment_${deploymentId}`;
}

export function deploymentDurableWorkAcceptedEventId(deploymentId: string): string {
  return `dwe_deployment_${deploymentId}_accepted`;
}

export interface DeploymentDurableWorkScheduleInput {
  readonly deployment: {
    readonly id: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly resourceId: string;
    readonly serverId?: string;
    readonly destinationId?: string;
    readonly triggerKind: string;
  };
  readonly operationKey: "deployments.create" | "deployments.redeploy";
  readonly acceptedAt: string;
}

export class DeploymentDurableWorkScheduler {
  constructor(private readonly adapter: DurableWorkQueueAdapter) {}

  async scheduleAcceptedDeployment(
    context: RepositoryContext,
    input: DeploymentDurableWorkScheduleInput,
  ): Promise<Result<{ workItemId: string }>> {
    const workItemId = deploymentDurableWorkItemId(input.deployment.id);
    const recorded = await this.adapter.recordItem(context, {
      id: workItemId,
      kind: deploymentDurableWorkKind,
      status: "pending",
      operationKey: input.operationKey,
      queueBackend: "database",
      dedupeKey: `${input.operationKey}:${input.deployment.id}`,
      correlationId: context.requestId,
      requestId: context.requestId,
      projectId: input.deployment.projectId,
      environmentId: input.deployment.environmentId,
      resourceId: input.deployment.resourceId,
      deploymentId: input.deployment.id,
      ...(input.deployment.serverId ? { serverId: input.deployment.serverId } : {}),
      subjectKind: "deployment",
      subjectId: input.deployment.id,
      phase: "accepted",
      step: "queued",
      priority: 0,
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: input.acceptedAt,
      updatedAt: input.acceptedAt,
      safeDetails: {
        deploymentId: input.deployment.id,
        triggerKind: input.deployment.triggerKind,
        operationKey: input.operationKey,
      },
    });
    if (recorded.isErr()) {
      return err(recorded.error);
    }

    const appended = await this.adapter.appendEvent(context, {
      id: deploymentDurableWorkAcceptedEventId(input.deployment.id),
      workItemId,
      sequence: 1,
      kind: "accepted",
      status: "pending",
      phase: "accepted",
      step: "queued",
      message: "Deployment work was accepted.",
      occurredAt: input.acceptedAt,
      safeDetails: {
        deploymentId: input.deployment.id,
        operationKey: input.operationKey,
      },
    });
    if (appended.isErr()) {
      return err(appended.error);
    }

    return ok({ workItemId });
  }
}

export class DeploymentDurableWorkHandler implements DurableWorkHandler {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
    private readonly executionBackend: ExecutionBackend,
    private readonly eventBus: EventBus,
    private readonly logger: AppLogger,
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async handle(
    context: ExecutionContext,
    item: DurableWorkItemRecord,
    _worker: DurableWorkWorkerIdentity,
  ): Promise<Result<DurableWorkHandlerResult>> {
    const deploymentId = item.deploymentId ?? item.subjectId;
    if (!deploymentId) {
      return err(
        domainError.validation("Deployment durable work requires a deployment id", {
          phase: "deployment-durable-work",
          workItemId: item.id,
        }),
      );
    }

    const deploymentIdResult = DeploymentId.create(deploymentId);
    if (deploymentIdResult.isErr()) {
      return err(deploymentIdResult.error);
    }

    const repositoryContext = toRepositoryContext(context);
    const deployment = await this.deploymentRepository.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(deploymentIdResult.value),
    );
    if (!deployment) {
      return err(domainError.notFound("deployment", deploymentId));
    }

    const executionResult = await this.executionBackend.execute(context, deployment);
    if (executionResult.isErr()) {
      const failureResult = this.deploymentLifecycleService.failExecution(
        deployment,
        executionResult.error,
      );
      if (failureResult.isErr()) {
        return err(failureResult.error);
      }

      const persisted = await this.persistAndPublish(context, repositoryContext, deployment);
      if (persisted.isErr()) {
        return err(persisted.error);
      }

      return ok({
        status: "failed",
        phase: "runtime-execution",
        step: "failed",
        errorCode: executionResult.error.code,
        errorCategory: executionResult.error.category,
        retriable: true,
        safeDetails: {
          deploymentId,
        },
      });
    }

    const persisted = await this.persistAndPublish(
      context,
      repositoryContext,
      executionResult.value.deployment,
    );
    if (persisted.isErr()) {
      return err(persisted.error);
    }

    return ok({
      status: "succeeded",
      phase: "runtime-execution",
      step: "completed",
      safeDetails: {
        deploymentId,
      },
    });
  }

  private async persistAndPublish(
    context: ExecutionContext,
    repositoryContext: RepositoryContext,
    deployment: Parameters<DeploymentRepository["updateOne"]>[1],
  ): Promise<Result<void>> {
    const updated = await this.deploymentRepository.updateOne(
      repositoryContext,
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );
    if (updated.isErr()) {
      return err(updated.error);
    }

    await publishDomainEventsAndReturn(context, this.eventBus, this.logger, deployment, undefined);
    await recordDeploymentProcessAttempt({
      recorder: this.processAttemptRecorder,
      repositoryContext,
      context,
      deployment,
      operationKey: this.processAttemptOperationKey(deployment),
    });

    return ok(undefined);
  }

  private processAttemptOperationKey(
    deployment: Parameters<DeploymentRepository["updateOne"]>[1],
  ): "deployments.create" | "deployments.redeploy" {
    return deployment.toState().triggerKind.value === "redeploy"
      ? "deployments.redeploy"
      : "deployments.create";
  }
}
