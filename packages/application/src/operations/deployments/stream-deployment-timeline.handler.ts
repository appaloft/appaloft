import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type StreamDeploymentTimelineResult } from "../../ports";
import { tokens } from "../../tokens";
import { type DeploymentTimelineQueryService } from "./deployment-timeline.query-service";
import { StreamDeploymentTimelineQuery } from "./stream-deployment-timeline.query";

@QueryHandler(StreamDeploymentTimelineQuery)
@injectable()
export class StreamDeploymentTimelineQueryHandler
  implements QueryHandlerContract<StreamDeploymentTimelineQuery, StreamDeploymentTimelineResult>
{
  constructor(
    @inject(tokens.deploymentTimelineQueryService)
    private readonly queryService: DeploymentTimelineQueryService,
  ) {}

  handle(context: ExecutionContext, query: StreamDeploymentTimelineQuery) {
    return this.queryService.stream(context, query);
  }
}
