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
import { type DeploymentRepository } from "../../ports";
import { tokens } from "../../tokens";
import { type ReattachDeploymentResult } from "./reattach-deployment.command";

@injectable()
export class ReattachDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: { deploymentId: string },
  ): Promise<Result<ReattachDeploymentResult>> {
    const { deploymentRepository } = this;
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

      const state = deployment.toState();
      return ok({
        id: state.id.value,
        status: state.status.value,
        logs: state.logs.map((log) => {
          const logState = log.toState();
          return {
            timestamp: logState.timestamp.value,
            source: logState.source.value,
            phase: logState.phase.value,
            level: logState.level.value,
            message: logState.message.value,
          };
        }),
      });
    });
  }
}
