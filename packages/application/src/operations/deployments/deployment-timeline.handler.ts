import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentTimelineReadResult } from "../../ports";
import { tokens } from "../../tokens";
import { DeploymentTimelineQuery } from "./deployment-timeline.query";
import { type DeploymentTimelineQueryService } from "./deployment-timeline.query-service";

@QueryHandler(DeploymentTimelineQuery)
@injectable()
export class DeploymentTimelineQueryHandler
  implements QueryHandlerContract<DeploymentTimelineQuery, DeploymentTimelineReadResult>
{
  constructor(
    @inject(tokens.deploymentTimelineQueryService)
    private readonly queryService: DeploymentTimelineQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: DeploymentTimelineQuery,
  ): Promise<Result<DeploymentTimelineReadResult>> {
    return this.queryService.read(context, query);
  }
}
