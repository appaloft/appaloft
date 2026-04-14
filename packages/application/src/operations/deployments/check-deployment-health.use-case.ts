import {
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentHealthChecker,
  type DeploymentHealthResult,
  type DeploymentRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CheckDeploymentHealthCommandInput } from "./check-deployment-health.command";

@injectable()
export class CheckDeploymentHealthUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.deploymentHealthChecker)
    private readonly deploymentHealthChecker: DeploymentHealthChecker,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CheckDeploymentHealthCommandInput,
  ): Promise<Result<DeploymentHealthResult>> {
    const { deploymentHealthChecker, deploymentRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const deploymentId = yield* DeploymentId.create(input.deploymentId);
      const deployment = await deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(deploymentId),
      );

      if (!deployment) {
        return err(domainError.notFound("deployment", input.deploymentId));
      }

      const result: DeploymentHealthResult = yield* await deploymentHealthChecker.check(
        context,
        deployment,
      );

      return ok(result);
    });
  }
}
