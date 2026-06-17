import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectionSnapshot } from "../../ports";
import { tokens } from "../../tokens";
import { ShowConnectionQuery } from "./show-connection.query";
import { type ShowConnectionQueryService } from "./show-connection.query-service";

@QueryHandler(ShowConnectionQuery)
@injectable()
export class ShowConnectionQueryHandler
  implements QueryHandlerContract<ShowConnectionQuery, ConnectionSnapshot>
{
  constructor(
    @inject(tokens.connectionQueryService)
    private readonly queryService: ShowConnectionQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowConnectionQuery) {
    return this.queryService.execute(context, { connectionId: query.connectionId });
  }
}
