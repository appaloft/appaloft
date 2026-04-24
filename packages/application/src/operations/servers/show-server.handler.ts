import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ServerDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowServerQuery } from "./show-server.query";
import { type ShowServerQueryService } from "./show-server.query-service";

@QueryHandler(ShowServerQuery)
@injectable()
export class ShowServerQueryHandler implements QueryHandlerContract<ShowServerQuery, ServerDetail> {
  constructor(
    @inject(tokens.showServerQueryService)
    private readonly queryService: ShowServerQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowServerQuery) {
    return this.queryService.execute(context, query);
  }
}
