import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceHealthHistory } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceHealthHistoryQuery } from "./resource-health-history.query";
import { type ResourceHealthHistoryQueryService } from "./resource-health-history.query-service";

@QueryHandler(ResourceHealthHistoryQuery)
@injectable()
export class ResourceHealthHistoryQueryHandler
  implements QueryHandlerContract<ResourceHealthHistoryQuery, ResourceHealthHistory>
{
  constructor(
    @inject(tokens.resourceHealthHistoryQueryService)
    private readonly queryService: ResourceHealthHistoryQueryService,
  ) {}

  handle(context: ExecutionContext, query: ResourceHealthHistoryQuery) {
    return this.queryService.execute(context, query);
  }
}
