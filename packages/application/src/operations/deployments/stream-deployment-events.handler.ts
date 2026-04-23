import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type StreamDeploymentEventsResult } from "../../ports";
import { tokens } from "../../tokens";
import { StreamDeploymentEventsQuery } from "./stream-deployment-events.query";
import { type StreamDeploymentEventsQueryService } from "./stream-deployment-events.query-service";

@QueryHandler(StreamDeploymentEventsQuery)
@injectable()
export class StreamDeploymentEventsQueryHandler
  implements QueryHandlerContract<StreamDeploymentEventsQuery, StreamDeploymentEventsResult>
{
  constructor(
    @inject(tokens.streamDeploymentEventsQueryService)
    private readonly queryService: StreamDeploymentEventsQueryService,
  ) {}

  handle(context: ExecutionContext, query: StreamDeploymentEventsQuery) {
    return this.queryService.execute(context, query);
  }
}
