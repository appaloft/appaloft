import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowDependencyResourceResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowDependencyResourceQuery } from "./show-dependency-resource.query";
import { type ShowDependencyResourceQueryService } from "./show-dependency-resource.query-service";

@QueryHandler(ShowDependencyResourceQuery)
@injectable()
export class ShowDependencyResourceQueryHandler
  implements QueryHandlerContract<ShowDependencyResourceQuery, ShowDependencyResourceResult>
{
  constructor(
    @inject(tokens.showDependencyResourceQueryService)
    private readonly queryService: ShowDependencyResourceQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ShowDependencyResourceQuery,
  ): Promise<Result<ShowDependencyResourceResult>> {
    return this.queryService.execute(context, query);
  }
}
