import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ListRouteSurfaceDecisionsQuery,
  type ListRouteSurfaceDecisionsResponse,
} from "./list-route-surface-decisions.query";
import { type ListRouteSurfaceDecisionsQueryService } from "./list-route-surface-decisions.query-service";

@QueryHandler(ListRouteSurfaceDecisionsQuery)
@injectable()
export class ListRouteSurfaceDecisionsQueryHandler
  implements QueryHandlerContract<ListRouteSurfaceDecisionsQuery, ListRouteSurfaceDecisionsResponse>
{
  constructor(
    @inject(tokens.listRouteSurfaceDecisionsQueryService)
    private readonly service: ListRouteSurfaceDecisionsQueryService,
  ) {}

  async handle(context: ExecutionContext, query: ListRouteSurfaceDecisionsQuery) {
    return this.service.execute(context, query);
  }
}
