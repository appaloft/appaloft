import { type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeLogsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceRuntimeLogsQuery } from "./resource-runtime-logs.query";
import { type ResourceRuntimeLogsQueryService } from "./resource-runtime-logs.query-service";

@QueryHandler(ResourceRuntimeLogsQuery)
@injectable()
export class ResourceRuntimeLogsQueryHandler
  implements QueryHandlerContract<ResourceRuntimeLogsQuery, ResourceRuntimeLogsResult>
{
  constructor(
    @inject(tokens.resourceRuntimeLogsQueryService)
    private readonly queryService: ResourceRuntimeLogsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ResourceRuntimeLogsQuery,
  ): Promise<Result<ResourceRuntimeLogsResult>> {
    return this.queryService.execute(context, query);
  }
}
