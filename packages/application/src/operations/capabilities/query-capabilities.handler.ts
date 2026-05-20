import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { QueryCapabilitiesQuery, type QueryCapabilitiesResponse } from "./query-capabilities.query";
import { type QueryCapabilitiesQueryService } from "./query-capabilities.query-service";

@QueryHandler(QueryCapabilitiesQuery)
@injectable()
export class QueryCapabilitiesQueryHandler
  implements QueryHandlerContract<QueryCapabilitiesQuery, QueryCapabilitiesResponse>
{
  constructor(
    @inject(tokens.queryCapabilitiesQueryService)
    private readonly service: QueryCapabilitiesQueryService,
  ) {}

  async handle(context: ExecutionContext, query: QueryCapabilitiesQuery) {
    return this.service.execute(context, query);
  }
}
