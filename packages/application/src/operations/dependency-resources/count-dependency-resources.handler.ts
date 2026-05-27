import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CountDependencyResourcesQuery } from "./count-dependency-resources.query";
import { type CountDependencyResourcesQueryService } from "./count-dependency-resources.query-service";

@QueryHandler(CountDependencyResourcesQuery)
@injectable()
export class CountDependencyResourcesQueryHandler
  implements QueryHandlerContract<CountDependencyResourcesQuery, { count: number }>
{
  constructor(
    @inject(tokens.countDependencyResourcesQueryService)
    private readonly queryService: CountDependencyResourcesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CountDependencyResourcesQuery,
  ): Promise<Result<{ count: number }>> {
    return this.queryService.execute(context, query);
  }
}
