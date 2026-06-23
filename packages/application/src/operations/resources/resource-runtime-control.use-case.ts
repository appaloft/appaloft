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
  type ProcessAttemptRecorder,
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
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { deploymentResourceRuntimeScopeForIds } from "../deployments/deployment-mutation-scopes";
import { isServerBackedDeploymentSummary } from "../deployments/deployment-target-guards";
import { type PreviewOperableScopeResolver } from "../preview-deployments/preview-operable-scope.resolver";

type ResourceRuntimeControlInput = {
  operation: ResourceRuntimeControlOperation;
  resourceId?: string;
  previewEnvironmentId?: string;
  deploymentId?: string;
  acknowledgeRetainedRuntimeMetadata?: boolean;
  reason?: string;
  idempotencyKey?: string;
};

type ResolvedResourceRuntimeControlInput = ResourceRuntimeControlInput & {
  resourceId: string;
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

function terminalRuntimeState(
  operation: ResourceRuntimeControlOperation,
): ResourceRuntimeControlRuntimeState {
  switch (operation) {
    case "stop":
      return "stopped";
    case "start":
    case "restart":
      return "running";
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

function runtimeControlProcessStatus(
  status: ResourceRuntimeControlAttemptRecord["status"],
): "running" | "succeeded" | "failed" {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "accepted":
    case "running":
      return "running";
    case "blocked":
    case "failed":
      return "failed";
  }
}

function runtimeControlNextActions(
  status: ResourceRuntimeControlAttemptRecord["status"],
): ["diagnostic", "manual-review"] | ["no-action"] {
  return status === "failed" || status === "blocked"
    ? ["diagnostic", "manual-review"]
    : ["no-action"];
}

async function recordRuntimeControlProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  attempt: ResourceRuntimeControlAttemptRecord;
  providerKey: string;
  runtimeKind: string;
  targetKind: string;
}): Promise<void> {
  const processStatus = runtimeControlProcessStatus(input.attempt.status);
  const errorCode =
    input.attempt.errorCode ??
    (input.attempt.blockedReason ? `resource_runtime_${input.attempt.blockedReason}` : undefined);
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.attempt.runtimeControlAttemptId,
    kind: "runtime-maintenance",
    status: processStatus,
    operationKey: operationKey(input.attempt.operation),
    dedupeKey: `resource-runtime-control:${input.attempt.resourceId}:${input.attempt.runtimeControlAttemptId}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "runtime-control",
    step: `${input.attempt.operation}-${input.attempt.status}`,
    resourceId: input.attempt.resourceId,
    ...(input.attempt.deploymentId ? { deploymentId: input.attempt.deploymentId } : {}),
    ...(input.attempt.serverId ? { serverId: input.attempt.serverId } : {}),
    startedAt: input.attempt.startedAt,
    updatedAt: input.attempt.completedAt ?? input.attempt.startedAt,
    ...(input.attempt.completedAt ? { finishedAt: input.attempt.completedAt } : {}),
    ...(errorCode ? { errorCode, errorCategory: "async-processing" } : {}),
    ...(processStatus === "failed" ? { retriable: true } : {}),
    nextActions: runtimeControlNextActions(input.attempt.status),
    safeDetails: {
      operation: input.attempt.operation,
      runtimeState: input.attempt.runtimeState,
      providerKey: input.providerKey,
      runtimeKind: input.runtimeKind,
      targetKind: input.targetKind,
      ...(input.attempt.reason ? { reason: input.attempt.reason } : {}),
      ...(input.attempt.blockedReason ? { blockedReason: input.attempt.blockedReason } : {}),
    },
  });

  void result;
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
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
    @inject(tokens.previewOperableScopeResolver)
    private readonly previewOperableScopeResolver?: PreviewOperableScopeResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    rawInput: ResourceRuntimeControlInput,
  ): Promise<Result<ResourceRuntimeControlCommandResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      attemptRecorder,
      clock,
      idGenerator,
      mutationCoordinator,
      processAttemptRecorder,
      resourceReadModel,
      resourceRepository,
      targetPort,
    } = this;
    const { previewOperableScopeResolver } = this;
    const useCase = this;

    return safeTry(async function* () {
      const previewScope = await previewOperableScopeResolver?.resolve(context, {
        previewEnvironmentId: rawInput.previewEnvironmentId,
        resourceId: rawInput.resourceId,
        deploymentId: rawInput.deploymentId,
        requireDeployment: Boolean(rawInput.previewEnvironmentId),
      });
      if (previewScope?.isErr()) {
        return err(previewScope.error);
      }
      const resolvedPreviewScope = previewScope?.isOk() ? previewScope.value : null;

      const resolvedResourceId = resolvedPreviewScope?.resourceId ?? rawInput.resourceId;
      if (!resolvedResourceId) {
        return err(
          domainError.validation("Either resourceId or previewEnvironmentId is required", {
            phase: "resource-runtime-control-resolution",
          }),
        );
      }
      const input: ResolvedResourceRuntimeControlInput = {
        ...rawInput,
        resourceId: resolvedResourceId,
        ...(resolvedPreviewScope?.deploymentId || rawInput.deploymentId
          ? { deploymentId: resolvedPreviewScope?.deploymentId ?? rawInput.deploymentId }
          : {}),
      };
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

      if (resourceState.lifecycleStatus.isArchived() && input.operation !== "stop") {
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
      if (!isServerBackedDeploymentSummary(deployment)) {
        return err(
          blockedError({
            message: "Resource runtime control requires a server-backed deployment",
            resourceId: input.resourceId,
            operation: input.operation,
            blockedReason: "runtime-control-target-unsupported",
          }),
        );
      }
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
      const isNoopStop = input.operation === "stop" && runtimeState === "stopped";
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
            await recordRuntimeControlProcessAttempt({
              recorder: processAttemptRecorder,
              repositoryContext,
              context,
              attempt: runningAttempt,
              providerKey: deployment.runtimePlan.target.providerKey,
              runtimeKind: deployment.runtimePlan.execution.kind,
              targetKind: deployment.runtimePlan.target.kind,
            });

            if (isNoopStop) {
              const terminalAttempt: ResourceRuntimeControlAttemptRecord = {
                ...runningAttempt,
                status: "succeeded",
                runtimeState: terminalRuntimeState(input.operation),
                completedAt: clock.now(),
              };
              const persisted = yield* await attemptRecorder.record(
                repositoryContext,
                terminalAttempt,
              );
              await recordRuntimeControlProcessAttempt({
                recorder: processAttemptRecorder,
                repositoryContext,
                context,
                attempt: terminalAttempt,
                providerKey: deployment.runtimePlan.target.providerKey,
                runtimeKind: deployment.runtimePlan.execution.kind,
                targetKind: deployment.runtimePlan.target.kind,
              });
              return ok(persisted);
            }

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
              ...(deployment.runtimePlan.execution.metadata
                ? { runtimeMetadata: deployment.runtimePlan.execution.metadata }
                : {}),
              ...(deployment.runtimePlan.execution.composeFile
                ? { composeFile: deployment.runtimePlan.execution.composeFile }
                : {}),
              ...(deployment.runtimePlan.execution.workingDirectory
                ? { workingDirectory: deployment.runtimePlan.execution.workingDirectory }
                : {}),
              ...(resourceSummary?.networkProfile?.targetServiceName
                ? { targetServiceName: resourceSummary.networkProfile.targetServiceName }
                : {}),
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
            await recordRuntimeControlProcessAttempt({
              recorder: processAttemptRecorder,
              repositoryContext,
              context,
              attempt: terminalAttempt,
              providerKey: deployment.runtimePlan.target.providerKey,
              runtimeKind: deployment.runtimePlan.execution.kind,
              targetKind: deployment.runtimePlan.target.kind,
            });

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
    input: ResolvedResourceRuntimeControlInput,
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
    input: ResolvedResourceRuntimeControlInput,
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
