import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type BlueprintCatalogQueryService } from "./blueprint-catalog.query-service";
import { type CreateBlueprintInstallPlanResponse } from "./blueprint-catalog.schema";
import { CreateBlueprintInstallPlanQuery } from "./create-blueprint-install-plan.query";

@QueryHandler(CreateBlueprintInstallPlanQuery)
@injectable()
export class CreateBlueprintInstallPlanQueryHandler
  implements
    QueryHandlerContract<CreateBlueprintInstallPlanQuery, CreateBlueprintInstallPlanResponse>
{
  constructor(
    @inject(tokens.blueprintCatalogQueryService)
    private readonly queryService: BlueprintCatalogQueryService,
  ) {}

  handle(context: ExecutionContext, query: CreateBlueprintInstallPlanQuery) {
    return this.queryService.createInstallPlan(context, query);
  }
}
