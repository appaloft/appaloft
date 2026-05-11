import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeployTokenSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListDeployTokensQuery } from "./list-deploy-tokens.query";
import { type ListDeployTokensQueryService } from "./list-deploy-tokens.query-service";

@QueryHandler(ListDeployTokensQuery)
@injectable()
export class ListDeployTokensQueryHandler
  implements QueryHandlerContract<ListDeployTokensQuery, { items: DeployTokenSummary[] }>
{
  constructor(
    @inject(tokens.listDeployTokensQueryService)
    private readonly queryService: ListDeployTokensQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListDeployTokensQuery,
  ): Promise<Result<{ items: DeployTokenSummary[] }>> {
    return ok(await this.queryService.execute(context, query));
  }
}
