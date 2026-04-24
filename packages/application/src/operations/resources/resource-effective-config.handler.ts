import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceEffectiveConfigView } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceEffectiveConfigQuery } from "./resource-effective-config.query";
import { type ResourceEffectiveConfigQueryService } from "./resource-effective-config.query-service";

@QueryHandler(ResourceEffectiveConfigQuery)
@injectable()
export class ResourceEffectiveConfigQueryHandler
  implements QueryHandlerContract<ResourceEffectiveConfigQuery, ResourceEffectiveConfigView>
{
  constructor(
    @inject(tokens.resourceEffectiveConfigQueryService)
    private readonly service: ResourceEffectiveConfigQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ResourceEffectiveConfigQuery,
  ): Promise<Result<ResourceEffectiveConfigView>> {
    return this.service.execute(context, {
      resourceId: query.resourceId,
    });
  }
}
