import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit } from "../shared-schema";

@injectable()
export class ListDeploymentsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly readModel: DeploymentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      includeArchived?: boolean;
      limit?: number;
    },
  ): Promise<{ items: Awaited<ReturnType<DeploymentReadModel["list"]>> }> {
    return {
      items: await this.readModel.list(toRepositoryContext(context), {
        ...(input?.projectId ? { projectId: input.projectId } : {}),
        ...(input?.resourceId ? { resourceId: input.resourceId } : {}),
        ...(input?.includeArchived !== undefined ? { includeArchived: input.includeArchived } : {}),
        limit: boundedListLimit(input?.limit),
      }),
    };
  }
}
