import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type SourceEventListResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListSourceEventsQuery } from "./list-source-events.query";
import { type ListSourceEventsQueryService } from "./list-source-events.query-service";

@QueryHandler(ListSourceEventsQuery)
@injectable()
export class ListSourceEventsQueryHandler
  implements QueryHandlerContract<ListSourceEventsQuery, SourceEventListResult>
{
  constructor(
    @inject(tokens.listSourceEventsQueryService)
    private readonly queryService: ListSourceEventsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListSourceEventsQuery) {
    return this.queryService.execute(context, query);
  }
}
