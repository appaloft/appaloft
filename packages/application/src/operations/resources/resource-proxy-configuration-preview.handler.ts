import { type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProxyConfigurationView } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceProxyConfigurationPreviewQuery } from "./resource-proxy-configuration-preview.query";
import { type ResourceProxyConfigurationPreviewQueryService } from "./resource-proxy-configuration-preview.query-service";

@QueryHandler(ResourceProxyConfigurationPreviewQuery)
@injectable()
export class ResourceProxyConfigurationPreviewQueryHandler
  implements QueryHandlerContract<ResourceProxyConfigurationPreviewQuery, ProxyConfigurationView>
{
  constructor(
    @inject(tokens.resourceProxyConfigurationPreviewQueryService)
    private readonly queryService: ResourceProxyConfigurationPreviewQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ResourceProxyConfigurationPreviewQuery,
  ): Promise<Result<ProxyConfigurationView>> {
    return this.queryService.execute(context, query);
  }
}
