import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AccountSessionSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListAccountSessionsQuery } from "./list-account-sessions.query";
import { type ListAccountSessionsQueryService } from "./list-account-sessions.query-service";

@QueryHandler(ListAccountSessionsQuery)
@injectable()
export class ListAccountSessionsQueryHandler
  implements
    QueryHandlerContract<
      ListAccountSessionsQuery,
      { items: AccountSessionSummary[]; nextCursor?: string }
    >
{
  constructor(
    @inject(tokens.listAccountSessionsQueryService)
    private readonly queryService: ListAccountSessionsQueryService,
  ) {}

  handle(context: ExecutionContext, _query: ListAccountSessionsQuery) {
    return this.queryService.execute(context);
  }
}
