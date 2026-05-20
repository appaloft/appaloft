import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { QueryEntitlementsQuery, type QueryEntitlementsResponse } from "./query-entitlements.query";
import { type QueryEntitlementsQueryService } from "./query-entitlements.query-service";

@QueryHandler(QueryEntitlementsQuery)
@injectable()
export class QueryEntitlementsQueryHandler
  implements QueryHandlerContract<QueryEntitlementsQuery, QueryEntitlementsResponse>
{
  constructor(
    @inject(tokens.queryEntitlementsQueryService)
    private readonly service: QueryEntitlementsQueryService,
  ) {}

  async handle(context: ExecutionContext, query: QueryEntitlementsQuery) {
    return this.service.execute(context, query);
  }
}
