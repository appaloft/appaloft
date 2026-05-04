import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListDependencyResourcesResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListDependencyResourcesQuery } from "./list-dependency-resources.query";
import { type ListDependencyResourcesQueryService } from "./list-dependency-resources.query-service";

@QueryHandler(ListDependencyResourcesQuery)
@injectable()
export class ListDependencyResourcesQueryHandler
  implements QueryHandlerContract<ListDependencyResourcesQuery, ListDependencyResourcesResult>
{
  constructor(
    @inject(tokens.listDependencyResourcesQueryService)
    private readonly queryService: ListDependencyResourcesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListDependencyResourcesQuery,
  ): Promise<Result<ListDependencyResourcesResult>> {
    return this.queryService.execute(context, query);
  }
}
