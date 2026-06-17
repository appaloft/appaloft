import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectionSnapshot } from "../../ports";
import { tokens } from "../../tokens";
import { ListConnectionsQuery } from "./list-connections.query";
import { type ListConnectionsQueryService } from "./list-connections.query-service";

@QueryHandler(ListConnectionsQuery)
@injectable()
export class ListConnectionsQueryHandler
  implements QueryHandlerContract<ListConnectionsQuery, { items: ConnectionSnapshot[] }>
{
  constructor(
    @inject(tokens.connectionsQueryService)
    private readonly queryService: ListConnectionsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListConnectionsQuery,
  ): Promise<Result<{ items: ConnectionSnapshot[] }>> {
    return ok(await this.queryService.execute(context, query.input));
  }
}
