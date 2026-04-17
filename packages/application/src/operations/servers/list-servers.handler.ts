import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ServerSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListServersQuery } from "./list-servers.query";
import { type ListServersQueryService } from "./list-servers.query-service";

@QueryHandler(ListServersQuery)
@injectable()
export class ListServersQueryHandler
  implements QueryHandlerContract<ListServersQuery, { items: ServerSummary[] }>
{
  constructor(
    @inject(tokens.listServersQueryService)
    private readonly queryService: ListServersQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListServersQuery,
  ): Promise<Result<{ items: ServerSummary[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
