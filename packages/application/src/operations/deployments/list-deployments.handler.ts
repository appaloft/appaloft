import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListDeploymentsQuery } from "./list-deployments.query";
import { type ListDeploymentsQueryService } from "./list-deployments.query-service";

@QueryHandler(ListDeploymentsQuery)
@injectable()
export class ListDeploymentsQueryHandler
  implements QueryHandlerContract<ListDeploymentsQuery, { items: DeploymentSummary[] }>
{
  constructor(
    @inject(tokens.listDeploymentsQueryService)
    private readonly queryService: ListDeploymentsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListDeploymentsQuery,
  ): Promise<Result<{ items: DeploymentSummary[] }>> {
    return ok(
      await this.queryService.execute(
        context,
        query.projectId || query.resourceId
          ? {
              ...(query.projectId ? { projectId: query.projectId } : {}),
              ...(query.resourceId ? { resourceId: query.resourceId } : {}),
            }
          : undefined,
      ),
    );
  }
}
