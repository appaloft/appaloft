import {
  DeploymentByIdSpec,
  DeploymentId,
  type DeploymentState,
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
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeploymentFactory } from "./deployment.factory";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { deploymentResourceRuntimeScopeForIds } from "./deployment-mutation-scopes";
import { type RetryDeploymentCommandInput } from "./retry-deployment.command";

function recoveryStateTimestamp(state: DeploymentState): string {
  return state.finishedAt?.value ?? state.startedAt?.value ?? state.createdAt.value;
}

function retryBlockedError(input: {
  deploymentId: string;
  resourceId: string;
  status: string;
  causeCode: string;
}) {
  return domainError.deploymentNotRetryable("Deployment attempt is not retryable", {
    commandName: "deployments.retry",
    phase: "retry-admission",
    deploymentId: input.deploymentId,
    resourceId: input.resourceId,
    status: input.status,
    causeCode: input.causeCode,
  });
}

@injectable()
export class RetryDeploymentUseCase {
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
  ) {}

  async execute(
    context: ExecutionContext,
    input: RetryDeploymentCommandInput,
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
      if (input.resourceId && input.resourceId !== sourceState.resourceId.value) {
        return err(
          domainError.resourceContextMismatch(
            "Deployment does not belong to the requested resource",
            {
              commandName: "deployments.retry",
              phase: "deployment-resource-context",
              deploymentId: input.deploymentId,
              expectedResourceId: input.resourceId,
              actualResourceId: sourceState.resourceId.value,
            },
          ),
        );
      }

      if (!sourceDeployment.canRetryRecovery()) {
        return err(
          retryBlockedError({
            deploymentId: sourceState.id.value,
            resourceId: sourceState.resourceId.value,
            status: sourceState.status.value,
            causeCode: sourceState.status.canStartNewDeployment()
              ? "attempt_status_not_recoverable"
              : "attempt_not_terminal",
          }),
        );
      }

      const stateTimestamp = recoveryStateTimestamp(sourceState);
      if (input.readinessGeneratedAt && input.readinessGeneratedAt < stateTimestamp) {
        return err(
          domainError.deploymentRecoveryStateStale("Deployment recovery readiness is stale", {
            commandName: "deployments.retry",
            phase: "retry-admission",
            deploymentId: sourceState.id.value,
            resourceId: sourceState.resourceId.value,
            readinessGeneratedAt: input.readinessGeneratedAt,
            currentStateTimestamp: stateTimestamp,
          }),
        );
      }

      const admitted = yield* await mutationCoordinator.runExclusive({
        context,
        policy: mutationCoordinationPolicies.retryDeployment,
        scope: deploymentResourceRuntimeScopeForIds({
          resourceId: sourceState.resourceId.value,
          serverId: sourceState.serverId.value,
          destinationId: sourceState.destinationId.value,
        }),
        owner: createCoordinationOwner(context, "deployments.retry"),
        work: async () =>
          safeTry(async function* () {
            const latestDeployment = await deploymentRepository.findOne(
              repositoryContext,
              LatestDeploymentSpec.forResource(sourceState.resourceId),
            );

            if (latestDeployment && !latestDeployment.canStartNewDeployment()) {
              const latestState = latestDeployment.toState();
              return err(
                retryBlockedError({
                  deploymentId: latestState.id.value,
                  resourceId: latestState.resourceId.value,
                  status: latestState.status.value,
                  causeCode: "resource_runtime_busy",
                }),
              );
            }

            const deployment = yield* deploymentFactory.createRetry({
              deployment: sourceDeployment,
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

      return ok({ id: executionResult.value.deployment.toState().id.value });
    });
  }
}
