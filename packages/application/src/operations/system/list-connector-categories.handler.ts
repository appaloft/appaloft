import { type ConnectionCategoryDefinitionSnapshot, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ListConnectorCategoriesQuery } from "./list-connector-categories.query";
import { type ListConnectorCategoriesQueryService } from "./list-connector-categories.query-service";

@QueryHandler(ListConnectorCategoriesQuery)
@injectable()
export class ListConnectorCategoriesQueryHandler
  implements
    QueryHandlerContract<
      ListConnectorCategoriesQuery,
      { items: ConnectionCategoryDefinitionSnapshot[] }
    >
{
  constructor(
    @inject(tokens.connectorCategoriesQueryService)
    private readonly queryService: ListConnectorCategoriesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListConnectorCategoriesQuery,
  ): Promise<Result<{ items: ConnectionCategoryDefinitionSnapshot[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
