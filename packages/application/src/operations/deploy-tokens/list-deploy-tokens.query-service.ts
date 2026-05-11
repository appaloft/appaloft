import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeployTokenReadModel, type DeployTokenSummary } from "../../ports";
import { tokens } from "../../tokens";
import { type ListDeployTokensQuery } from "./list-deploy-tokens.query";

@injectable()
export class ListDeployTokensQueryService {
  constructor(
    @inject(tokens.deployTokenReadModel)
    private readonly readModel: DeployTokenReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListDeployTokensQuery,
  ): Promise<{ items: DeployTokenSummary[] }> {
    return {
      items: await this.readModel.list(toRepositoryContext(context), {
        organizationId: query.organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.repositoryFullName ? { repositoryFullName: query.repositoryFullName } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    };
  }
}
