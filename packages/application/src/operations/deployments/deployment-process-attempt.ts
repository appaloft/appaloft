import { type Deployment } from "@appaloft/core";
import { type ExecutionContext, type toRepositoryContext } from "../../execution-context";
import { type ProcessAttemptNextAction, type ProcessAttemptRecorder } from "../../ports";
import { requireServerBackedDeploymentState } from "./deployment-target-guards";

function deploymentProcessNextActions(status: string): ProcessAttemptNextAction[] {
  return status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"];
}

export async function recordDeploymentProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  deployment: Deployment;
  operationKey: "deployments.create" | "deployments.redeploy" | "deployments.force-redeploy";
}): Promise<void> {
  const state = requireServerBackedDeploymentState(
    input.deployment,
    input.operationKey,
  )._unsafeUnwrap();
  const runtimePlan = state.runtimePlan;
  const runtimePlanState = runtimePlan.toState();
  const execution = runtimePlan.execution;
  const executionMetadata = execution.metadata ?? {};
  const status = state.status.value;
  const processStatus =
    status === "failed" ? "failed" : status === "succeeded" ? "succeeded" : "running";
  const errorCode =
    executionMetadata.errorCode ?? (status === "failed" ? "deployment_failed" : undefined);
  const updatedAt = state.finishedAt?.value ?? state.startedAt?.value ?? state.createdAt.value;
  const result = await input.recorder.record(input.repositoryContext, {
    id: state.id.value,
    kind: "deployment",
    status: processStatus,
    operationKey: input.operationKey,
    dedupeKey: `deployment:${state.id.value}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "deployment-execution",
    step: status,
    projectId: state.projectId.value,
    resourceId: state.resourceId.value,
    deploymentId: state.id.value,
    serverId: state.serverId.value,
    startedAt: state.startedAt?.value ?? state.createdAt.value,
    updatedAt,
    ...(state.finishedAt ? { finishedAt: state.finishedAt.value } : {}),
    ...(errorCode ? { errorCode, errorCategory: "async-processing" } : {}),
    ...(processStatus === "failed" ? { retriable: true } : {}),
    nextActions: deploymentProcessNextActions(status),
    safeDetails: {
      triggerKind: state.triggerKind.value,
      deploymentStatus: status,
      buildStrategy: runtimePlan.buildStrategy,
      packagingMode: runtimePlan.packagingMode,
      executionKind: execution.kind,
      targetKind: runtimePlan.target.kind,
      targetProviderKey: runtimePlan.target.providerKey,
      stepCount: runtimePlanState.steps.length,
      ...(state.sourceDeploymentId ? { sourceDeploymentId: state.sourceDeploymentId.value } : {}),
      ...(state.supersedesDeploymentId
        ? { supersedesDeploymentId: state.supersedesDeploymentId.value }
        : {}),
      ...(executionMetadata.phase ? { failurePhase: executionMetadata.phase } : {}),
      ...(executionMetadata.step ? { failureStep: executionMetadata.step } : {}),
      ...(executionMetadata.message ? { failureMessage: executionMetadata.message } : {}),
      ...(executionMetadata.publicRouteFailureKind
        ? { publicRouteFailureKind: executionMetadata.publicRouteFailureKind }
        : {}),
      ...(executionMetadata.url && executionMetadata.phase === "public-route-verification"
        ? { publicRouteUrl: executionMetadata.url }
        : {}),
      ...(executionMetadata.safeAdapterErrorCode
        ? { safeAdapterErrorCode: executionMetadata.safeAdapterErrorCode }
        : {}),
      ...(executionMetadata.capacityResource
        ? { capacityResource: executionMetadata.capacityResource }
        : {}),
      ...(executionMetadata.capacitySignal
        ? { capacitySignal: executionMetadata.capacitySignal }
        : {}),
      ...(executionMetadata.capacityInspectCommand
        ? { capacityInspectCommand: executionMetadata.capacityInspectCommand }
        : {}),
      ...(executionMetadata.capacityPruneCommand
        ? { capacityPruneCommand: executionMetadata.capacityPruneCommand }
        : {}),
    },
  });

  void result;
}
