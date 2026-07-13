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
  type Clock,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
  type MutationCoordinator,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { deploymentResourceRuntimeScopeForIds } from "./deployment-mutation-scopes";
import { observeDeploymentStaleness } from "./deployment-stale-attempt.policy";
import { requireServerBackedDeploymentState } from "./deployment-target-guards";
import { type ReconcileStaleDeploymentResult } from "./reconcile-stale-deployment.command";
import { type ReconcileStaleDeploymentCommandPayload } from "./reconcile-stale-deployment.schema";

function staleState(deployment: Deployment) {
  const state = deployment.toState();
  return {
    id: state.id.value,
    status: state.status.value,
    createdAt: state.createdAt.value,
    ...(state.startedAt ? { startedAt: state.startedAt.value } : {}),
    timeline: state.timeline.map((entry) => ({ timestamp: entry.timestamp })),
  };
}

@injectable()
export class ReconcileStaleDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.executionBackend) private readonly executionBackend: ExecutionBackend,
    @inject(tokens.deploymentLifecycleService)
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
    @inject(tokens.clock) private readonly clock: Clock,
    @inject(tokens.eventBus) private readonly eventBus: EventBus,
    @inject(tokens.logger) private readonly logger: AppLogger,
    @inject(tokens.mutationCoordinator) private readonly mutationCoordinator: MutationCoordinator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ReconcileStaleDeploymentCommandPayload,
  ): Promise<Result<ReconcileStaleDeploymentResult>> {
    const deploymentId = input.deploymentId.trim();
    if (input.confirm.trim() !== deploymentId) {
      return err(
        domainError.validation(
          "Deployment reconciliation confirmation must match the deployment id",
          {
            commandName: "deployments.reconcile-stale",
            phase: "command-validation",
            deploymentId,
            confirmationMismatch: true,
          },
        ),
      );
    }
    const repositoryContext = toRepositoryContext(context);
    const source = await this.deploymentRepository.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
    );
    if (!source) return err(domainError.notFound("deployment", deploymentId));
    const sourceState = source.toState();
    if (input.resourceId && input.resourceId !== sourceState.resourceId.value) {
      return err(
        domainError.resourceContextMismatch(
          "Deployment does not belong to the requested resource",
          {
            commandName: "deployments.reconcile-stale",
            phase: "deployment-resource-context",
            deploymentId,
            expectedResourceId: input.resourceId,
            actualResourceId: sourceState.resourceId.value,
          },
        ),
      );
    }
    const serverBacked = requireServerBackedDeploymentState(source, "deployments.reconcile-stale");
    if (serverBacked.isErr()) return err(serverBacked.error);
    const {
      clock,
      deploymentLifecycleService,
      deploymentRepository,
      eventBus,
      executionBackend,
      logger,
    } = this;

    return this.mutationCoordinator.runExclusive({
      context,
      policy: mutationCoordinationPolicies.cancelDeployment,
      scope: deploymentResourceRuntimeScopeForIds({
        resourceId: sourceState.resourceId.value,
        serverId: serverBacked.value.serverId.value,
        destinationId: serverBacked.value.destinationId.value,
      }),
      owner: createCoordinationOwner(context, "deployments.reconcile-stale"),
      work: async () =>
        safeTry(async function* () {
          const deployment = await deploymentRepository.findOne(
            repositoryContext,
            DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
          );
          if (!deployment) return err(domainError.notFound("deployment", deploymentId));

          const observation = observeDeploymentStaleness(staleState(deployment), {
            checkedAt: clock.now(),
            staleAfterSeconds: input.staleAfterSeconds,
          });
          if (observation.stateVersion !== input.stateVersion) {
            return err(
              domainError.deploymentReconciliationStateStale(
                "Deployment changed after stale observation",
                {
                  commandName: "deployments.reconcile-stale",
                  phase: "reconcile-admission",
                  deploymentId,
                  currentStatus: deployment.toState().status.value,
                  latestActivityAt: observation.latestActivityAt,
                },
              ),
            );
          }
          if (!observation.stale) {
            return err(
              domainError.deploymentReconciliationNotAllowed(
                "Deployment attempt is not stale and cannot be reconciled",
                {
                  commandName: "deployments.reconcile-stale",
                  phase: "reconcile-admission",
                  deploymentId,
                  currentStatus: deployment.toState().status.value,
                  latestActivityAt: observation.latestActivityAt,
                  staleForSeconds: observation.staleForSeconds,
                  staleAfterSeconds: input.staleAfterSeconds,
                },
              ),
            );
          }

          const cancelResult = deployment.requiresRuntimeCancellationForStaleReconciliation()
            ? yield* await executionBackend.cancel(context, deployment)
            : { timeline: [] };
          yield* deploymentLifecycleService.interrupt(deployment, cancelResult.timeline);
          yield* await deploymentRepository.updateOne(
            repositoryContext,
            deployment,
            UpsertDeploymentSpec.fromDeployment(deployment),
          );
          await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);
          const state = deployment.toState();
          return ok({
            id: state.id.value,
            status: "interrupted" as const,
            interruptedAt: state.finishedAt?.value ?? clock.now(),
          });
        }),
    });
  }
}
