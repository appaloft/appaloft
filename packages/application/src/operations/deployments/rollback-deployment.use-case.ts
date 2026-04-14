import {
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpsertDeploymentSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";

import {
  type AppLogger,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeploymentFactory } from "./deployment.factory";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { type RollbackPlanFactory } from "./rollback-plan.factory";

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
    @inject(tokens.rollbackPlanFactory)
    private readonly rollbackPlanFactory: RollbackPlanFactory,
    @inject(tokens.deploymentLifecycleService)
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
  ) {}

  async execute(context: ExecutionContext, deploymentId: string): Promise<Result<{ id: string }>> {
    const {
      deploymentFactory,
      deploymentLifecycleService,
      deploymentRepository,
      eventBus,
      executionBackend,
      logger,
      rollbackPlanFactory,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const currentDeploymentId = yield* DeploymentId.create(deploymentId);
      const deployment = await deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(currentDeploymentId),
      );

      if (!deployment) {
        return err(domainError.notFound("deployment", deploymentId));
      }

      const rollbackDeploymentResult = deploymentFactory.createRollback({
        deployment,
        rollbackOfDeploymentId: currentDeploymentId,
      });
      const rollbackDeployment = yield* rollbackDeploymentResult;

      const prepareResult = deploymentLifecycleService.prepareForExecution(rollbackDeployment);
      yield* prepareResult;

      await deploymentRepository.upsert(
        repositoryContext,
        rollbackDeployment,
        UpsertDeploymentSpec.fromDeployment(rollbackDeployment),
      );

      const startResult = deploymentLifecycleService.startExecution(rollbackDeployment);
      yield* startResult;

      await deploymentRepository.upsert(
        repositoryContext,
        rollbackDeployment,
        UpsertDeploymentSpec.fromDeployment(rollbackDeployment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, rollbackDeployment, undefined);

      const rollbackPlanResult = rollbackPlanFactory.create(deployment);
      const rollbackPlan = yield* rollbackPlanResult;
      const rollbackExecutionResult = await executionBackend.rollback(
        context,
        rollbackDeployment,
        rollbackPlan,
      );
      const rollbackResult = yield* rollbackExecutionResult;

      await deploymentRepository.upsert(
        repositoryContext,
        rollbackResult.deployment,
        UpsertDeploymentSpec.fromDeployment(rollbackResult.deployment),
      );
      await publishDomainEventsAndReturn(
        context,
        eventBus,
        logger,
        rollbackResult.deployment,
        undefined,
      );

      return ok({ id: rollbackResult.deployment.toState().id.value });
    });
  }
}
