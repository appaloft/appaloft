import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceOverview } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceOverviewQuery } from "./resource-overview.query";
import { type ResourceOverviewQueryService } from "./resource-overview.query-service";

@QueryHandler(ResourceOverviewQuery)
@injectable()
export class ResourceOverviewQueryHandler implements QueryHandlerContract<
  ResourceOverviewQuery,
  ResourceOverview
> {
  constructor(
    @inject(tokens.resourceOverviewQueryService)
    private readonly queryService: ResourceOverviewQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ResourceOverviewQuery,
  ): Promise<Result<ResourceOverview>> {
    return this.queryService.execute(context, query);
  }
}
