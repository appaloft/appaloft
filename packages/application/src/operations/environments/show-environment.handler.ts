import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ShowEnvironmentQuery } from "./show-environment.query";
import { type ShowEnvironmentQueryService } from "./show-environment.query-service";

@QueryHandler(ShowEnvironmentQuery)
@injectable()
export class ShowEnvironmentQueryHandler
  implements QueryHandlerContract<ShowEnvironmentQuery, EnvironmentSummary>
{
  constructor(
    @inject(tokens.showEnvironmentQueryService)
    private readonly queryService: ShowEnvironmentQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowEnvironmentQuery) {
    return this.queryService.execute(context, query.environmentId);
  }
}
