import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowResourceDependencyBindingResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowResourceDependencyBindingQuery } from "./show-resource-dependency-binding.query";
import { type ShowResourceDependencyBindingQueryService } from "./show-resource-dependency-binding.query-service";

@QueryHandler(ShowResourceDependencyBindingQuery)
@injectable()
export class ShowResourceDependencyBindingQueryHandler
  implements
    QueryHandlerContract<ShowResourceDependencyBindingQuery, ShowResourceDependencyBindingResult>
{
  constructor(
    @inject(tokens.showResourceDependencyBindingQueryService)
    private readonly queryService: ShowResourceDependencyBindingQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ShowResourceDependencyBindingQuery,
  ): Promise<Result<ShowResourceDependencyBindingResult>> {
    return this.queryService.execute(context, {
      resourceId: query.resourceId,
      bindingId: query.bindingId,
    });
  }
}
