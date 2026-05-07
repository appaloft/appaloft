import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type SourceEventDeploymentDispatcher,
  type SourceEventDeploymentDispatchInput,
  type SourceEventDeploymentDispatchResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CreateDeploymentCommandInput } from "../deployments/create-deployment.command";

interface CreateDeploymentAdmission {
  execute(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<{ id: string }>>;
}

@injectable()
export class CreateDeploymentSourceEventDispatcher implements SourceEventDeploymentDispatcher {
  constructor(
    @inject(tokens.createDeploymentUseCase)
    private readonly createDeploymentUseCase: CreateDeploymentAdmission,
  ) {}

  async dispatch(
    context: ExecutionContext,
    input: SourceEventDeploymentDispatchInput,
  ): Promise<Result<SourceEventDeploymentDispatchResult>> {
    const result = await this.createDeploymentUseCase.execute(context, {
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    });

    return result.map((deployment) => ({ deploymentId: deployment.id }));
  }
}
