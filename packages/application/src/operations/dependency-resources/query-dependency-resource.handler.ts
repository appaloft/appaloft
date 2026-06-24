import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DependencyResourceSafeQueryResult } from "../../ports";
import { tokens } from "../../tokens";
import { QueryDependencyResourceQuery } from "./query-dependency-resource.query";
import { type QueryDependencyResourceQueryService } from "./query-dependency-resource.query-service";

@QueryHandler(QueryDependencyResourceQuery)
@injectable()
export class QueryDependencyResourceQueryHandler
  implements QueryHandlerContract<QueryDependencyResourceQuery, DependencyResourceSafeQueryResult>
{
  constructor(
    @inject(tokens.queryDependencyResourceQueryService)
    private readonly queryService: QueryDependencyResourceQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: QueryDependencyResourceQuery,
  ): Promise<Result<DependencyResourceSafeQueryResult>> {
    return this.queryService.execute(context, query);
  }
}
