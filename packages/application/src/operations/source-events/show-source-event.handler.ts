import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type SourceEventDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowSourceEventQuery } from "./show-source-event.query";
import { type ShowSourceEventQueryService } from "./show-source-event.query-service";

@QueryHandler(ShowSourceEventQuery)
@injectable()
export class ShowSourceEventQueryHandler
  implements QueryHandlerContract<ShowSourceEventQuery, SourceEventDetail>
{
  constructor(
    @inject(tokens.showSourceEventQueryService)
    private readonly queryService: ShowSourceEventQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowSourceEventQuery) {
    return this.queryService.execute(context, query);
  }
}
