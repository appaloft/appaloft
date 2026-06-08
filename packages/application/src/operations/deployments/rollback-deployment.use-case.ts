import {
  type Deployment,
  DeploymentByIdSpec,
  DeploymentId,
  type DeploymentState,
  type DeploymentStatus,
  domainError,
  err,
  LatestDeploymentSpec,
  ok,
  type Result,
  safeTry,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type AppLogger,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
  type MutationCoordinator,
  type ProcessAttemptNextAction,
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeploymentFactory } from "./deployment.factory";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { deploymentResourceRuntimeScopeForIds } from "./deployment-mutation-scopes";
import {
  isServerBackedDeploymentState,
  requireServerBackedDeploymentState,
} from "./deployment-target-guards";
import { type RollbackDeploymentCommandInput } from "./rollback-deployment.command";

function recoveryStateTimestamp(state: DeploymentState): string {
  return state.finishedAt?.value ?? state.startedAt?.value ?? state.createdAt.value;
}

function maxTimestamp(left: string, right: string): string {
  return left > right ? left : right;
}

function rollbackCandidateNotFound(input: {
  deploymentId: string;
  rollbackCandidateDeploymentId: string;
  resourceId?: string;
  causeCode: string;
}) {
  return domainError.deploymentRollbackCandidateNotFound(
    "Rollback candidate deployment was not found",
    {
      commandName: "deployments.rollback",
      phase: "rollback-admission",
      deploymentId: input.deploymentId,
      rollbackCandidateDeploymentId: input.rollbackCandidateDeploymentId,
      causeCode: input.causeCode,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    },
  );
}

function rollbackNotReady(input: {
  deploymentId: string;
  rollbackCandidateDeploymentId: string;
  resourceId: string;
  causeCode: string;
  status?: DeploymentStatus;
}) {
  return domainError.deploymentNotRollbackReady("Deployment candidate is not rollback-ready", {
    commandName: "deployments.rollback",
    phase: "rollback-admission",
    deploymentId: input.deploymentId,
    rollbackCandidateDeploymentId: input.rollbackCandidateDeploymentId,
    resourceId: input.resourceId,
    causeCode: input.causeCode,
    ...(input.status ? { status: input.status } : {}),
  });
}

function hasRollbackArtifact(state: DeploymentState): boolean {
  const runtimePlanState = state.runtimePlan.toState();
  const runtimeArtifact = runtimePlanState.runtimeArtifact?.toState();
  const execution = runtimePlanState.execution.toState();

  return Boolean(
    runtimeArtifact?.image ||
      runtimeArtifact?.composeFile ||
      execution.image ||
      execution.composeFile,
  );
}

function isCompatibleRollbackCandidate(input: {
  source: DeploymentState;
  candidate: DeploymentState;
}): boolean {
  if (
    !isServerBackedDeploymentState(input.source) ||
    !isServerBackedDeploymentState(input.candidate)
  ) {
    return false;
  }

  return (
    input.source.resourceId.value === input.candidate.resourceId.value &&
    input.source.projectId.value === input.candidate.projectId.value &&
    input.source.environmentId.value === input.candidate.environmentId.value &&
    input.source.serverId.value === input.candidate.serverId.value &&
    input.source.destinationId.value === input.candidate.destinationId.value
  );
}

function deploymentProcessNextActions(status: string): ProcessAttemptNextAction[] {
  return status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"];
}

async function recordRollbackDeploymentProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  deployment: Deployment;
}): Promise<void> {
  const state = requireServerBackedDeploymentState(
    input.deployment,
    "deployments.rollback",
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
    operationKey: "deployments.rollback",
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
      ...(state.rollbackCandidateDeploymentId
        ? { rollbackCandidateDeploymentId: state.rollbackCandidateDeploymentId.value }
        : {}),
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
    },
  });

  void result;
}

@injectable()
export class RollbackDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.deploymentFactory)
    private readonly deploymentFactory: DeploymentFactory,
    @inject(tokens.deploymentLifecycleService)
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: RollbackDeploymentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      deploymentFactory,
      deploymentLifecycleService,
      deploymentRepository,
      eventBus,
      executionBackend,
      logger,
      mutationCoordinator,
      processAttemptRecorder,
    } = this;

    return safeTry(async function* () {
      const sourceDeployment = await deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(DeploymentId.rehydrate(input.deploymentId)),
      );

      if (!sourceDeployment) {
        return err(domainError.notFound("deployment", input.deploymentId));
      }

      const sourceState = sourceDeployment.toState();
      const sourceServerBacked = yield* requireServerBackedDeploymentState(
        sourceDeployment,
        "deployments.rollback",
      );
      if (input.resourceId && input.resourceId !== sourceState.resourceId.value) {
        return err(
          domainError.resourceContextMismatch(
            "Deployment does not belong to the requested resource",
            {
              commandName: "deployments.rollback",
              phase: "deployment-resource-context",
              deploymentId: input.deploymentId,
              expectedResourceId: input.resourceId,
              actualResourceId: sourceState.resourceId.value,
            },
          ),
        );
      }

      const candidateDeployment = await deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(DeploymentId.rehydrate(input.rollbackCandidateDeploymentId)),
      );

      if (!candidateDeployment) {
        return err(
          rollbackCandidateNotFound({
            deploymentId: sourceState.id.value,
            rollbackCandidateDeploymentId: input.rollbackCandidateDeploymentId,
            resourceId: sourceState.resourceId.value,
            causeCode: "candidate_not_found",
          }),
        );
      }

      const candidateState = candidateDeployment.toState();
      if (
        !isCompatibleRollbackCandidate({
          source: sourceState,
          candidate: candidateState,
        })
      ) {
        return err(
          rollbackCandidateNotFound({
            deploymentId: sourceState.id.value,
            rollbackCandidateDeploymentId: candidateState.id.value,
            resourceId: sourceState.resourceId.value,
            causeCode: "candidate_scope_mismatch",
          }),
        );
      }

      if (candidateState.status.value !== "succeeded") {
        return err(
          rollbackCandidateNotFound({
            deploymentId: sourceState.id.value,
            rollbackCandidateDeploymentId: candidateState.id.value,
            resourceId: sourceState.resourceId.value,
            causeCode: "candidate_not_successful",
          }),
        );
      }

      if (!hasRollbackArtifact(candidateState)) {
        return err(
          rollbackNotReady({
            deploymentId: sourceState.id.value,
            rollbackCandidateDeploymentId: candidateState.id.value,
            resourceId: sourceState.resourceId.value,
            causeCode: "runtime_artifact_missing",
            status: candidateState.status.value,
          }),
        );
      }

      const stateTimestamp = maxTimestamp(
        recoveryStateTimestamp(sourceState),
        recoveryStateTimestamp(candidateState),
      );
      if (input.readinessGeneratedAt && input.readinessGeneratedAt < stateTimestamp) {
        return err(
          domainError.deploymentRecoveryStateStale("Deployment recovery readiness is stale", {
            commandName: "deployments.rollback",
            phase: "rollback-admission",
            deploymentId: sourceState.id.value,
            rollbackCandidateDeploymentId: candidateState.id.value,
            resourceId: sourceState.resourceId.value,
            readinessGeneratedAt: input.readinessGeneratedAt,
            currentStateTimestamp: stateTimestamp,
          }),
        );
      }

      const admitted = yield* await mutationCoordinator.runExclusive({
        context,
        policy: mutationCoordinationPolicies.rollbackDeployment,
        scope: deploymentResourceRuntimeScopeForIds({
          resourceId: sourceState.resourceId.value,
          serverId: sourceServerBacked.serverId.value,
          destinationId: sourceServerBacked.destinationId.value,
        }),
        owner: createCoordinationOwner(context, "deployments.rollback"),
        work: async () =>
          safeTry(async function* () {
            const latestDeployment = await deploymentRepository.findOne(
              repositoryContext,
              LatestDeploymentSpec.forResource(sourceState.resourceId),
            );

            if (latestDeployment && !latestDeployment.canStartNewDeployment()) {
              const latestState = latestDeployment.toState();
              return err(
                rollbackNotReady({
                  deploymentId: sourceState.id.value,
                  rollbackCandidateDeploymentId: candidateState.id.value,
                  resourceId: sourceState.resourceId.value,
                  causeCode: "resource_runtime_busy",
                  status: latestState.status.value,
                }),
              );
            }

            const deployment = yield* deploymentFactory.createRollback({
              candidateDeployment,
              sourceDeploymentId: sourceState.id,
              ...(latestDeployment
                ? { supersedesDeploymentId: latestDeployment.toState().id }
                : {}),
            });
            yield* deploymentLifecycleService.prepareForExecution(deployment);

            const insertResult = await deploymentRepository.insertOne(
              repositoryContext,
              deployment,
              UpsertDeploymentSpec.fromDeployment(deployment),
            );
            yield* insertResult;
            await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

            yield* deploymentLifecycleService.startExecution(deployment);
            const startPersistResult = await deploymentRepository.updateOne(
              repositoryContext,
              deployment,
              UpsertDeploymentSpec.fromDeployment(deployment),
            );
            yield* startPersistResult;
            await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);
            await recordRollbackDeploymentProcessAttempt({
              recorder: processAttemptRecorder,
              repositoryContext,
              context,
              deployment,
            });
            return ok(deployment);
          }),
      });

      const executionResult = await executionBackend.execute(context, admitted);
      if (executionResult.isErr()) {
        yield* deploymentLifecycleService.failExecution(admitted, executionResult.error);
        const failurePersistResult = await deploymentRepository.updateOne(
          repositoryContext,
          admitted,
          UpsertDeploymentSpec.fromDeployment(admitted),
        );
        yield* failurePersistResult;
        await publishDomainEventsAndReturn(context, eventBus, logger, admitted, undefined);
        await recordRollbackDeploymentProcessAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          context,
          deployment: admitted,
        });
        return ok({ id: admitted.toState().id.value });
      }

      const terminalPersistResult = await deploymentRepository.updateOne(
        repositoryContext,
        executionResult.value.deployment,
        UpsertDeploymentSpec.fromDeployment(executionResult.value.deployment),
      );
      yield* terminalPersistResult;
      await publishDomainEventsAndReturn(
        context,
        eventBus,
        logger,
        executionResult.value.deployment,
        undefined,
      );
      await recordRollbackDeploymentProcessAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        context,
        deployment: executionResult.value.deployment,
      });

      return ok({ id: executionResult.value.deployment.toState().id.value });
    });
  }
}
