import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type BlueprintCatalogQueryService } from "./blueprint-catalog.query-service";
import { type ShowBlueprintResponse } from "./blueprint-catalog.schema";
import { ShowBlueprintQuery } from "./show-blueprint.query";

@QueryHandler(ShowBlueprintQuery)
@injectable()
export class ShowBlueprintQueryHandler
  implements QueryHandlerContract<ShowBlueprintQuery, ShowBlueprintResponse>
{
  constructor(
    @inject(tokens.blueprintCatalogQueryService)
    private readonly queryService: BlueprintCatalogQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowBlueprintQuery) {
    return this.queryService.show(context, query);
  }
}
