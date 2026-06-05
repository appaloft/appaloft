import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type BlueprintCatalogQueryService } from "./blueprint-catalog.query-service";
import { type ListBlueprintsResponse } from "./blueprint-catalog.schema";
import { ListBlueprintsQuery } from "./list-blueprints.query";

@QueryHandler(ListBlueprintsQuery)
@injectable()
export class ListBlueprintsQueryHandler
  implements QueryHandlerContract<ListBlueprintsQuery, ListBlueprintsResponse>
{
  constructor(
    @inject(tokens.blueprintCatalogQueryService)
    private readonly queryService: BlueprintCatalogQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListBlueprintsQuery) {
    void query;
    return this.queryService.list(context);
  }
}
