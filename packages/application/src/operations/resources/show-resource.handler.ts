import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowResourceQuery } from "./show-resource.query";
import { type ShowResourceQueryService } from "./show-resource.query-service";

@QueryHandler(ShowResourceQuery)
@injectable()
export class ShowResourceQueryHandler
  implements QueryHandlerContract<ShowResourceQuery, ResourceDetail>
{
  constructor(
    @inject(tokens.showResourceQueryService)
    private readonly queryService: ShowResourceQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowResourceQuery) {
    return this.queryService.execute(context, query);
  }
}
