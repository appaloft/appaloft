import {
  type DomainError,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type IdGenerator,
  type MutationCoordinator,
  type ResourceReadModel,
  type ResourceRepository,
  type ResourceRuntimeControlAttemptRecord,
  type ResourceRuntimeControlAttemptRecorder,
  type ResourceRuntimeControlBlockedReason,
  type ResourceRuntimeControlCommandResult,
  type ResourceRuntimeControlOperation,
  type ResourceRuntimeControlRuntimeState,
  type ResourceRuntimeControlTargetPort,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { deploymentResourceRuntimeScopeForIds } from "../deployments/deployment-mutation-scopes";

type ResourceRuntimeControlInput = {
  operation: ResourceRuntimeControlOperation;
  resourceId: string;
  deploymentId?: string;
  acknowledgeRetainedRuntimeMetadata?: boolean;
  reason?: string;
  idempotencyKey?: string;
};

type ResourceRuntimeControlPolicyKey =
  | "stopResourceRuntime"
  | "startResourceRuntime"
  | "restartResourceRuntime";

const activeDeploymentStatuses = new Set(["created", "planning", "planned", "running"]);

function operationPolicyKey(
  operation: ResourceRuntimeControlOperation,
): ResourceRuntimeControlPolicyKey {
  switch (operation) {
    case "stop":
      return "stopResourceRuntime";
    case "start":
      return "startResourceRuntime";
    case "restart":
      return "restartResourceRuntime";
  }
}

function operationKey(operation: ResourceRuntimeControlOperation): string {
  return mutationCoordinationPolicies[operationPolicyKey(operation)].operationKey;
}

function blockedError(input: {
  message: string;
  resourceId: string;
  operation: ResourceRuntimeControlOperation;
  blockedReason: ResourceRuntimeControlBlockedReason;
}): DomainError {
  return {
    code: "resource_runtime_control_blocked",
    category: "user",
    message: input.message,
    retryable: false,
    details: {
      phase: "runtime-control-admission",
      resourceId: input.resourceId,
      operation: input.operation,
      blockedReason: input.blockedReason,
    },
  };
}

function metadataMissingError(input: {
  message: string;
  resourceId: string;
  operation: ResourceRuntimeControlOperation;
  deploymentId?: string;
  missingMetadataKind: string;
}): DomainError {
  return {
    code: "resource_runtime_metadata_missing",
    category: "user",
    message: input.message,
    retryable: false,
    details: {
      phase: "runtime-control-admission",
      resourceId: input.resourceId,
      operation: input.operation,
      missingMetadataKind: input.missingMetadataKind,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
    },
  };
}

function alreadyInStateError(input: {
  resourceId: string;
  operation: ResourceRuntimeControlOperation;
  runtimeState: ResourceRuntimeControlRuntimeState;
}): DomainError {
  return {
    code: "resource_runtime_already_in_state",
    category: "user",
    message: `Resource runtime is already ${input.runtimeState}`,
    retryable: false,
    details: {
      phase: "runtime-control-admission",
      resourceId: input.resourceId,
      operation: input.operation,
      runtimeState: input.runtimeState,
    },
  };
}

function controlFailedError(input: {
  runtimeControlAttemptId: string;
  resourceId: string;
  operation: ResourceRuntimeControlOperation;
  errorCode: string;
}): DomainError {
  return {
    code: "resource_runtime_control_failed",
    category: "provider",
    message: "Resource runtime control failed",
    retryable: true,
    details: {
      phase: "runtime-control-execution",
      runtimeControlAttemptId: input.runtimeControlAttemptId,
      resourceId: input.resourceId,
      operation: input.operation,
      safeAdapterErrorCode: input.errorCode,
    },
  };
}

function inferRuntimeState(
  resource: ResourceSummary | null,
  deployment: DeploymentSummary,
): ResourceRuntimeControlRuntimeState {
  const latestRuntimeControl = resource?.latestRuntimeControl;
  if (latestRuntimeControl?.status === "accepted" || latestRuntimeControl?.status === "running") {
    return latestRuntimeControl.runtimeState;
  }

  if (latestRuntimeControl?.runtimeState) {
    return latestRuntimeControl.runtimeState;
  }

  if (deployment.status === "succeeded") {
    return "running";
  }

  if (activeDeploymentStatuses.has(deployment.status)) {
    return "starting";
  }

  return "unknown";
}

function runningRuntimeState(
  operation: ResourceRuntimeControlOperation,
): ResourceRuntimeControlRuntimeState {
  switch (operation) {
    case "stop":
      return "stopping";
    case "start":
      return "starting";
    case "restart":
      return "restarting";
  }
}

function toCommandResult(
  record: ResourceRuntimeControlAttemptRecord,
): ResourceRuntimeControlCommandResult {
  return {
    runtimeControlAttemptId: record.runtimeControlAttemptId,
    resourceId: record.resourceId,
    ...(record.deploymentId ? { deploymentId: record.deploymentId } : {}),
    operation: record.operation,
    status: record.status,
    startedAt: record.startedAt,
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    runtimeState: record.runtimeState,
    ...(record.blockedReason ? { blockedReason: record.blockedReason } : {}),
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    ...(record.phases ? { phases: record.phases } : {}),
  };
}

@injectable()
export class ResourceRuntimeControlUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.resourceRuntimeControlTargetPort)
    private readonly targetPort: ResourceRuntimeControlTargetPort,
    @inject(tokens.resourceRuntimeControlAttemptRecorder)
    private readonly attemptRecorder: ResourceRuntimeControlAttemptRecorder,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ResourceRuntimeControlInput,
  ): Promise<Result<ResourceRuntimeControlCommandResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      attemptRecorder,
      clock,
      idGenerator,
      mutationCoordinator,
      resourceReadModel,
      resourceRepository,
      targetPort,
    } = this;
    const useCase = this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", input.resourceId));
      }

      const resourceState = resource.toState();
      if (resourceState.lifecycleStatus.isDeleted()) {
        return err(
          blockedError({
            message: "Resource runtime control is blocked for deleted resources",
            resourceId: input.resourceId,
            operation: input.operation,
            blockedReason: "resource-deleted",
          }),
        );
      }

      if (resourceState.lifecycleStatus.isArchived()) {
        return err(
          blockedError({
            message: "Resource runtime control is blocked for archived resources",
            resourceId: input.resourceId,
            operation: input.operation,
            blockedReason: "resource-archived",
          }),
        );
      }

      const resourceSummary = await resourceReadModel.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      const deployment = yield* await useCase.resolveDeployment(context, input, resourceSummary);
      const runtimeState = inferRuntimeState(resourceSummary, deployment);

      const latestRuntimeControl = resourceSummary?.latestRuntimeControl;
      if (
        latestRuntimeControl?.status === "accepted" ||
        latestRuntimeControl?.status === "running"
      ) {
        return err(
          blockedError({
            message: "Resource runtime control is already in progress",
            resourceId: input.resourceId,
            operation: input.operation,
            blockedReason: "runtime-control-in-progress",
          }),
        );
      }

      const admission = useCase.admitControl(input, runtimeState);
      if (admission.isErr()) {
        return err(admission.error);
      }

      const attemptId = idGenerator.next("rtc");
      const startedAt = clock.now();
      const runningAttempt: ResourceRuntimeControlAttemptRecord = {
        runtimeControlAttemptId: attemptId,
        resourceId: input.resourceId,
        deploymentId: deployment.id,
        serverId: deployment.serverId,
        destinationId: deployment.destinationId,
        operation: input.operation,
        status: "running",
        startedAt,
        runtimeState: runningRuntimeState(input.operation),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.operation === "restart"
          ? {
              phases: [
                { phase: "stop", status: "pending" },
                { phase: "start", status: "pending" },
              ],
            }
          : {}),
      };

      const policy = mutationCoordinationPolicies[operationPolicyKey(input.operation)];
      const record = yield* await mutationCoordinator.runExclusive({
        context,
        policy,
        scope: deploymentResourceRuntimeScopeForIds({
          resourceId: input.resourceId,
          serverId: deployment.serverId,
          destinationId: deployment.destinationId,
        }),
        owner: createCoordinationOwner(context, operationKey(input.operation)),
        work: async () =>
          safeTry(async function* () {
            yield* await attemptRecorder.record(repositoryContext, runningAttempt);

            const targetResult = await targetPort.control(context, {
              runtimeControlAttemptId: attemptId,
              operation: input.operation,
              resourceId: input.resourceId,
              deploymentId: deployment.id,
              serverId: deployment.serverId,
              destinationId: deployment.destinationId,
              runtimeKind: deployment.runtimePlan.execution.kind,
              targetKind: deployment.runtimePlan.target.kind,
              providerKey: deployment.runtimePlan.target.providerKey,
              ...(input.reason ? { reason: input.reason } : {}),
            });

            const terminalAttempt: ResourceRuntimeControlAttemptRecord = {
              ...runningAttempt,
              status: targetResult.isOk() ? targetResult.value.status : "failed",
              runtimeState: targetResult.isOk() ? targetResult.value.runtimeState : "unknown",
              completedAt: clock.now(),
              ...(targetResult.isOk() && targetResult.value.blockedReason
                ? { blockedReason: targetResult.value.blockedReason }
                : {}),
              ...(targetResult.isOk() && targetResult.value.errorCode
                ? { errorCode: targetResult.value.errorCode }
                : {}),
              ...(targetResult.isOk() && targetResult.value.phases
                ? { phases: targetResult.value.phases }
                : {}),
              ...(targetResult.isErr() ? { errorCode: targetResult.error.code } : {}),
            };

            const persisted = yield* await attemptRecorder.record(
              repositoryContext,
              terminalAttempt,
            );

            if (targetResult.isErr()) {
              return err(
                controlFailedError({
                  runtimeControlAttemptId: attemptId,
                  resourceId: input.resourceId,
                  operation: input.operation,
                  errorCode: targetResult.error.code,
                }),
              );
            }

            return ok(persisted);
          }),
      });

      return ok(toCommandResult(record));
    });
  }

  private async resolveDeployment(
    context: ExecutionContext,
    input: ResourceRuntimeControlInput,
    resource: ResourceSummary | null,
  ): Promise<Result<DeploymentSummary, DomainError>> {
    const repositoryContext = toRepositoryContext(context);
    const deployments = await this.deploymentReadModel.list(repositoryContext, {
      resourceId: input.resourceId,
    });

    const selectedDeploymentId = input.deploymentId ?? resource?.lastDeploymentId;
    const selected = selectedDeploymentId
      ? deployments.find((deployment) => deployment.id === selectedDeploymentId)
      : [...deployments].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    if (!selected) {
      return err(
        metadataMissingError({
          message: "Resource runtime placement metadata is missing",
          resourceId: input.resourceId,
          operation: input.operation,
          missingMetadataKind: "runtime-placement",
          ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
        }),
      );
    }

    return ok(selected);
  }

  private admitControl(
    input: ResourceRuntimeControlInput,
    runtimeState: ResourceRuntimeControlRuntimeState,
  ): Result<void, DomainError> {
    if (runtimeState === "unknown") {
      return err(
        metadataMissingError({
          message: "Resource runtime metadata is missing or stale",
          resourceId: input.resourceId,
          operation: input.operation,
          missingMetadataKind: "runtime-state",
          ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
        }),
      );
    }

    if (
      runtimeState === "starting" ||
      runtimeState === "stopping" ||
      runtimeState === "restarting"
    ) {
      return err(
        blockedError({
          message: "Resource runtime control is blocked while runtime state is changing",
          resourceId: input.resourceId,
          operation: input.operation,
          blockedReason: "runtime-control-in-progress",
        }),
      );
    }

    if (input.operation === "stop" && runtimeState === "stopped") {
      return err(
        alreadyInStateError({
          resourceId: input.resourceId,
          operation: input.operation,
          runtimeState,
        }),
      );
    }

    if (input.operation === "start" && runtimeState === "running") {
      return err(
        alreadyInStateError({
          resourceId: input.resourceId,
          operation: input.operation,
          runtimeState,
        }),
      );
    }

    return ok(undefined);
  }
}
