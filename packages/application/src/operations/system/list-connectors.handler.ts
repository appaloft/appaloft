import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectorDescriptor } from "../../ports";
import { tokens } from "../../tokens";
import { ListConnectorsQuery } from "./list-connectors.query";
import { type ListConnectorsQueryService } from "./list-connectors.query-service";

@QueryHandler(ListConnectorsQuery)
@injectable()
export class ListConnectorsQueryHandler
  implements QueryHandlerContract<ListConnectorsQuery, { items: ConnectorDescriptor[] }>
{
  constructor(
    @inject(tokens.connectorsQueryService)
    private readonly queryService: ListConnectorsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListConnectorsQuery,
  ): Promise<Result<{ items: ConnectorDescriptor[] }>> {
    return ok(await this.queryService.execute(context, query.input));
  }
}
