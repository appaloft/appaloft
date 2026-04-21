import { DeploymentByIdSpec, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentExecutionGuard, type DeploymentRepository } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class RepositoryBackedDeploymentExecutionGuard implements DeploymentExecutionGuard {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
  ) {}

  async shouldContinue(
    context: ExecutionContext,
    deployment: Parameters<DeploymentExecutionGuard["shouldContinue"]>[1],
  ): Promise<Result<{ allowed: boolean; supersededByDeploymentId?: string }>> {
    const current = await this.deploymentRepository.findOne(
      toRepositoryContext(context),
      DeploymentByIdSpec.create(deployment.toState().id),
    );

    if (!current) {
      return ok({ allowed: false });
    }

    const state = current.toState();
    return ok({
      allowed:
        state.status.value !== "cancel-requested" &&
        state.status.value !== "canceled" &&
        !state.supersededByDeploymentId,
      ...(state.supersededByDeploymentId
        ? { supersededByDeploymentId: state.supersededByDeploymentId.value }
        : {}),
    });
  }
}
