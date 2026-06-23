import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type CountDeploymentsQuery } from "./count-deployments.query";

@injectable()
export class CountDeploymentsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly readModel: DeploymentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query?: CountDeploymentsQuery,
  ): Promise<{ count: number }> {
    return {
      count: await this.readModel.count(toRepositoryContext(context), {
        ...(query?.projectId ? { projectId: query.projectId } : {}),
        ...(query?.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query?.includeArchived !== undefined ? { includeArchived: query.includeArchived } : {}),
        ...(query?.activeResourcesOnly !== undefined
          ? { activeResourcesOnly: query.activeResourcesOnly }
          : {}),
        ...(query?.status ? { status: query.status } : {}),
        ...(query?.statuses?.length ? { statuses: query.statuses } : {}),
      }),
    };
  }
}
