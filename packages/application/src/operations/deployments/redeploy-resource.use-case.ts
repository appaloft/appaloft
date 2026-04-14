import {
  type Deployment as DeploymentAggregate,
  domainError,
  err,
  LatestDeploymentSpec,
  ok,
  ResourceId,
  type Result,
  safeTry,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentRepository } from "../../ports";
import { tokens } from "../../tokens";
import { type CancelDeploymentUseCase } from "./cancel-deployment.use-case";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";
import { type CreateDeploymentUseCase } from "./create-deployment.use-case";

function redeployInputFromLatest(input: {
  resourceId: string;
  latest: DeploymentAggregate;
}): CreateDeploymentCommandInput {
  const state = input.latest.toState();

  return {
    projectId: state.projectId.value,
    serverId: state.serverId.value,
    destinationId: state.destinationId.value,
    environmentId: state.environmentId.value,
    resourceId: input.resourceId,
  };
}

@injectable()
export class RedeployResourceUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.createDeploymentUseCase)
    private readonly createDeploymentUseCase: CreateDeploymentUseCase,
    @inject(tokens.cancelDeploymentUseCase)
    private readonly cancelDeploymentUseCase: CancelDeploymentUseCase,
  ) {}

  async execute(
    context: ExecutionContext,
    input: { resourceId: string; force?: boolean },
  ): Promise<Result<{ id: string }>> {
    const { cancelDeploymentUseCase, createDeploymentUseCase, deploymentRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const latestDeployment = await deploymentRepository.findOne(
        repositoryContext,
        LatestDeploymentSpec.forResource(resourceId),
      );

      if (!latestDeployment) {
        return err(domainError.notFound("deployment for resource", input.resourceId));
      }

      if (!latestDeployment.canStartNewDeployment()) {
        if (!input.force) {
          const latestState = latestDeployment.toState();
          return err(
            domainError.deploymentNotRedeployable(
              "Latest deployment for this resource must be terminal before redeploying",
              {
                deploymentId: latestState.id.value,
                resourceId: latestState.resourceId.value,
                status: latestState.status.value,
              },
            ),
          );
        }

        const cancelResult = await cancelDeploymentUseCase.execute(context, {
          deploymentId: latestDeployment.toState().id.value,
          reason: "forced redeploy",
        });
        yield* cancelResult;
      }

      const createInput = redeployInputFromLatest({
        resourceId: input.resourceId,
        latest: latestDeployment,
      });

      const createResult = await createDeploymentUseCase.execute(context, createInput);
      return ok(yield* createResult);
    });
  }
}
