import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceHealthSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceHealthQuery } from "./resource-health.query";
import { type ResourceHealthQueryService } from "./resource-health.query-service";

@QueryHandler(ResourceHealthQuery)
@injectable()
export class ResourceHealthQueryHandler
  implements QueryHandlerContract<ResourceHealthQuery, ResourceHealthSummary>
{
  constructor(
    @inject(tokens.resourceHealthQueryService)
    private readonly queryService: ResourceHealthQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ResourceHealthQuery,
  ): Promise<Result<ResourceHealthSummary>> {
    return this.queryService.execute(context, query);
  }
}
