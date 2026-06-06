import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ShowBlueprintInstallationResponse } from "./blueprint-catalog.schema";
import { type BlueprintInstallationQueryService } from "./blueprint-installation.query-service";
import { ShowBlueprintInstallationQuery } from "./show-blueprint-installation.query";

@QueryHandler(ShowBlueprintInstallationQuery)
@injectable()
export class ShowBlueprintInstallationQueryHandler
  implements QueryHandlerContract<ShowBlueprintInstallationQuery, ShowBlueprintInstallationResponse>
{
  constructor(
    @inject(tokens.blueprintInstallationQueryService)
    private readonly queryService: BlueprintInstallationQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowBlueprintInstallationQuery) {
    return this.queryService.show(context, query);
  }
}
