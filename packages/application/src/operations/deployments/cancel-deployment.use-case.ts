import {
  type Deployment,
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
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
import { type CancelDeploymentCommandInput } from "./cancel-deployment.command";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { deploymentResourceRuntimeScopeForIds } from "./deployment-mutation-scopes";
import { requireServerBackedDeploymentState } from "./deployment-target-guards";

export interface CancelDeploymentResult {
  id: string;
  status: "canceled";
  canceledAt: string;
}

function cancelBlockedError(deployment: Deployment) {
  const state = deployment.toState();
  return domainError.deploymentCancelNotAllowed("Deployment attempt cannot be canceled", {
    commandName: "deployments.cancel",
    phase: "cancel-admission",
    deploymentId: state.id.value,
    resourceId: state.resourceId.value,
    status: state.status.value,
  });
}

@injectable()
export class CancelDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
    @inject(tokens.deploymentLifecycleService)
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CancelDeploymentCommandInput,
  ): Promise<Result<CancelDeploymentResult>> {
    const repositoryContext = toRepositoryContext(context);
    const deploymentId = input.deploymentId.trim();

    if (input.confirm.trim() !== deploymentId) {
      return err(
        domainError.validation("Deployment cancel confirmation must match the deployment id", {
          commandName: "deployments.cancel",
          phase: "command-validation",
          deploymentId,
          confirmationMismatch: true,
        }),
      );
    }

    const sourceDeployment = await this.deploymentRepository.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
    );

    if (!sourceDeployment) {
      return err(domainError.notFound("deployment", deploymentId));
    }

    const sourceState = sourceDeployment.toState();
    const sourceServerBacked = requireServerBackedDeploymentState(
      sourceDeployment,
      "deployments.cancel",
    );
    if (sourceServerBacked.isErr()) {
      return err(sourceServerBacked.error);
    }
    if (input.resourceId && input.resourceId !== sourceState.resourceId.value) {
      return err(
        domainError.resourceContextMismatch(
          "Deployment does not belong to the requested resource",
          {
            commandName: "deployments.cancel",
            phase: "deployment-resource-context",
            deploymentId,
            expectedResourceId: input.resourceId,
            actualResourceId: sourceState.resourceId.value,
          },
        ),
      );
    }

    const { deploymentLifecycleService, deploymentRepository, eventBus, executionBackend, logger } =
      this;

    return this.mutationCoordinator.runExclusive({
      context,
      policy: mutationCoordinationPolicies.cancelDeployment,
      scope: deploymentResourceRuntimeScopeForIds({
        resourceId: sourceState.resourceId.value,
        serverId: sourceServerBacked.value.serverId.value,
        destinationId: sourceServerBacked.value.destinationId.value,
      }),
      owner: createCoordinationOwner(context, "deployments.cancel"),
      work: async () =>
        safeTry(async function* () {
          const deployment = await deploymentRepository.findOne(
            repositoryContext,
            DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
          );

          if (!deployment) {
            return err(domainError.notFound("deployment", deploymentId));
          }

          if (!deployment.canCancel()) {
            return err(cancelBlockedError(deployment));
          }

          const currentState = deployment.toState();
          if (currentState.status.value === "running") {
            yield* deploymentLifecycleService.requestCancellation(deployment);
            const requestPersistResult = await deploymentRepository.updateOne(
              repositoryContext,
              deployment,
              UpsertDeploymentSpec.fromDeployment(deployment),
            );
            yield* requestPersistResult;
            await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);
          }

          const cancelLogs = deployment.requiresRuntimeCancellationForManualCancel()
            ? yield* await executionBackend.cancel(context, deployment)
            : { timeline: [] };

          yield* deploymentLifecycleService.cancel(deployment, cancelLogs.timeline);
          const cancelPersistResult = await deploymentRepository.updateOne(
            repositoryContext,
            deployment,
            UpsertDeploymentSpec.fromDeployment(deployment),
          );
          yield* cancelPersistResult;
          await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

          const canceledState = deployment.toState();
          return ok({
            id: canceledState.id.value,
            status: "canceled" as const,
            canceledAt: canceledState.finishedAt?.value ?? currentState.createdAt.value,
          });
        }),
    });
  }
}
